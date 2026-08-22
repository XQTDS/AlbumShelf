import { ipcMain, BrowserWindow, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { exportDatabase, importDatabase, type ExportData } from './database'
import { AlbumService, AlbumQueryOptions, type Album } from './album-service'
import { TrackService, type Track } from './track-service'
import { NcmCliService, publishTimeToReleaseDate } from './ncm-cli-service'
import { ensureBuiltinCredentials } from './ncm-credentials'
import { TrackSyncService } from './track-sync-service'
import { SyncManager } from './sync/sync-manager'
import { NcmCliSyncService } from './sync/ncm-cli-sync-service'
import {
  EnrichService,
  createMbClient,
  loadCredentials,
  saveCredentials,
  hasCredentials,
  clearCredentials,
  isMbClientInitialized,
  getEnrichStrategies,
  loadSettings,
  saveSettings,
  type MbCredentials,
  type MbFuzzyCandidate
} from './enrich'
import * as authService from './auth-service'
import { NcmLoginRequiredError } from './ncm-cli-service'

let albumService: AlbumService
let trackService: TrackService
let ncmCliService: NcmCliService
let trackSyncService: TrackSyncService
let syncManager: SyncManager
let enrichService: EnrichService

// 封面批量补全进行中标志（防重入）
let coverFillRunning = false

// 发行日期批量回填进行中标志（防重入）
let releaseDateFillRunning = false

// 播放会话代际：新一轮 player:playAlbum / player:stop 使上一轮未完成的
// 后台补队列任务失效（代际不匹配即中止），避免旧任务污染新队列
let playQueueGeneration = 0

// 模糊确认弹窗队列：批量补全扫描遇到精确匹配失败的专辑时入队，
// 由消费器串行弹窗（同一时刻最多一个），不阻塞批量补全流程
interface FuzzyConfirmQueueItem {
  album: Album
  candidates: MbFuzzyCandidate[]
}

const fuzzyConfirmQueue: FuzzyConfirmQueueItem[] = []
let fuzzyDialogDraining = false

/**
 * 初始化所有服务实例
 */
function initServices(): void {
  albumService = new AlbumService()
  trackService = new TrackService()
  ncmCliService = new NcmCliService()
  trackSyncService = new TrackSyncService(ncmCliService, trackService, albumService)

  // 通过 ncm-cli album collected 直接拉取收藏专辑列表
  const syncService = new NcmCliSyncService(ncmCliService)
  syncManager = new SyncManager(syncService, albumService)

  enrichService = new EnrichService(albumService)

  // 初始化 MusicBrainz 客户端（搜索和 lookup 不需要认证）
  const credentials = loadCredentials()
  createMbClient(credentials ?? undefined)
}

/**
 * 注册所有 IPC handlers
 */
export function registerIpcHandlers(): void {
  initServices()

  // 启动时确保内置网易云 API 凭证已写入（fire-and-forget，不阻塞启动；
  // 失败仅记日志，数据功能调用时会自然报"凭证未配置"错误）
  ensureBuiltinCredentials(ncmCliService).catch((error) => {
    console.error('[ncm-cli] 内置凭证写入失败:', error)
  })

  // ==================== 同步操作 ====================

  /**
   * 触发同步操作
   * 返回同步结果统计（新增/跳过/总数），同步过程中通过 sync:progress 推送进度
   */
  ipcMain.handle('sync:start', async (event) => {
    try {
      const result = await syncManager.sync((progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('sync:progress', progress)
        }
      })

      // 同步完成后，如果有新增专辑且 MB 客户端已初始化，自动触发补全
      if (result.added > 0 && isMbClientInitialized()) {
        // 异步触发，不阻塞同步返回
        const mainWindow = BrowserWindow.getAllWindows()[0]
        enrichAll(mainWindow).catch((err) =>
          console.error('自动补全失败:', err)
        )
      }

      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 专辑查询 ====================

  /**
   * 查询专辑列表（支持筛选、排序、搜索、分页）
   */
  ipcMain.handle('album:list', async (_event, options: AlbumQueryOptions) => {
    try {
      const result = albumService.queryAlbums(options)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 随机获取一张专辑（返回完整专辑数据）
   */
  ipcMain.handle('album:random', async () => {
    try {
      const albumId = albumService.getRandomAlbumId()
      if (albumId === null) {
        return { success: false, error: '没有可选的专辑' }
      }
      const album = albumService.getAlbumById(albumId)
      return { success: true, data: album }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 获取筛选选项（所有艺术家 + 所有风格标签）
   */
  ipcMain.handle('album:filters', async () => {
    try {
      const artists = albumService.getAllArtists()
      const genres = albumService.getAllGenres()
      return { success: true, data: { artists, genres } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 曲目查询 ====================

  /**
   * 查询指定专辑的曲目列表
   * 若本地无曲目且专辑有 netease_album_id，自动从 ncm-cli 拉取
   */
  ipcMain.handle('track:listByAlbum', async (_event, albumId: number) => {
    try {
      let tracks = trackService.getTracksByAlbumId(albumId)

      // 本地无曲目数据，尝试自动从 ncm-cli 拉取
      if (tracks.length === 0) {
        const album = albumService.getAlbumById(albumId)
        if (album && album.netease_album_id) {
          try {
            tracks = await trackSyncService.syncTracksByAlbum(albumId, album.netease_album_id)
          } catch (syncError) {
            console.error(`自动拉取曲目失败 (albumId: ${albumId}):`, syncError)
            // 拉取失败返回空数组，不影响正常使用
          }
        }
      }

      return { success: true, data: tracks }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 网易云热评 ====================

  /**
   * 获取专辑的网易云热门评论（首屏 20 条，不持久化）
   * 头像 URL http→https 转换后返回；失败返回错误信息由前端区块内展示
   */
  ipcMain.handle('album:comments', async (_event, albumId: number) => {
    try {
      const album = albumService.getAlbumById(albumId)
      if (!album) {
        return { success: false, error: `专辑不存在 (id: ${albumId})` }
      }

      // 无网易云 ID 返回空，前端隐藏区块
      if (!album.netease_album_id) {
        return { success: true, data: { recordCount: 0, comments: [] } }
      }

      const response = await ncmCliService.getAlbumHotComments(album.netease_album_id)

      // 头像 URL http→https（网易云图片服务支持 https）
      const comments = response.records.map((comment) => ({
        id: comment.id,
        content: comment.content,
        likedCount: comment.likedCount,
        creator: {
          originalId: comment.creator.originalId,
          nickname: comment.creator.nickname,
          avatarUrl: comment.creator.avatarUrl
            ? comment.creator.avatarUrl.replace(/^http:\/\//, 'https://')
            : null
        },
        time: comment.time
      }))

      return { success: true, data: { recordCount: response.recordCount, comments } }
    } catch (error) {
      // 需要登录时附带 loginRequired 标记，前端提示登录
      if (error instanceof NcmLoginRequiredError) {
        return { success: false, error: '请先登录网易云音乐账号', loginRequired: true }
      }
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 封面获取 ====================

  /**
   * 获取专辑封面 URL
   * 若本地已有 cover_url 则直接返回；否则通过 ncm-cli album get 获取并持久化
   */
  ipcMain.handle('album:fetchCover', async (_event, albumId: number, force?: boolean) => {
    try {
      const album = albumService.getAlbumById(albumId)
      if (!album) {
        return { success: false, error: `专辑不存在 (id: ${albumId})` }
      }

      // 已有有效 cover_url 且非强制刷新，直接返回
      if (album.cover_url && !force) {
        return { success: true, data: { cover_url: album.cover_url } }
      }

      // 无 netease_album_id，无法获取
      if (!album.netease_album_id) {
        return { success: true, data: { cover_url: null } }
      }

      // 通过 ncm-cli 获取专辑详情，提取 coverImgUrl
      try {
        const detail = await ncmCliService.getAlbumDetail(album.netease_album_id)
        if (detail.coverImgUrl) {
          // 将 http 转为 https（网易云图片服务支持 https）
          const coverUrl = detail.coverImgUrl.replace(/^http:\/\//, 'https://')
          // 持久化到数据库
          albumService.updateAlbum(albumId, { cover_url: coverUrl })
          return { success: true, data: { cover_url: coverUrl } }
        }
      } catch (fetchError) {
        console.error(`获取专辑封面失败 (albumId: ${albumId}):`, fetchError)
      }

      return { success: true, data: { cover_url: null } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 批量补全缺失封面 ====================

  /**
   * 获取封面补全状态（缺失封面数量 + 是否正在补全）
   */
  ipcMain.handle('album:coverFillStatus', async () => {
    try {
      const pending = albumService.getAlbumsWithoutCover()
      return {
        success: true,
        data: {
          pending: pending.length,
          running: coverFillRunning
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 批量补全所有缺失封面的专辑
   * 逐个调用 getAlbumDetail 获取 coverImgUrl 并持久化，通过 event 推送进度
   * 失败不重试：重跑时仅处理仍缺失封面的专辑，天然增量收敛
   */
  ipcMain.handle('album:coverFillStart', async (event) => {
    if (coverFillRunning) {
      return { success: false, error: '封面补全正在进行中，请稍后再试' }
    }
    coverFillRunning = true

    try {
      const albums = albumService.getAlbumsWithoutCover()
      const total = albums.length

      if (total === 0) {
        return { success: true, data: { total: 0, filled: 0, failed: 0 } }
      }

      // 登录前置检查：未登录直接弹登录窗，避免批量无效调用
      const loginStatus = await ncmCliService.getLoginStatus()
      if (!loginStatus.isLoggedIn) {
        authService.triggerLoginPopup()
        return { success: true, data: { total, filled: 0, failed: 0 }, loginRequired: true }
      }

      const sender = event.sender
      let filled = 0
      let failed = 0

      for (let i = 0; i < albums.length; i++) {
        const album = albums[i]

        // 推送进度
        sender.send('album:coverFillProgress', {
          current: i + 1,
          total,
          albumTitle: album.title,
          filled
        })

        try {
          const detail = await ncmCliService.getAlbumDetail(album.netease_album_id)

          if (detail.coverImgUrl) {
            // 将 http 转为 https（网易云图片服务支持 https）
            const coverUrl = detail.coverImgUrl.replace(/^http:\/\//, 'https://')
            albumService.updateAlbum(album.id, { cover_url: coverUrl })
            filled++
          } else {
            // 网易云也没有封面，无法补全
            failed++
          }
        } catch (err) {
          // 登录失效：弹登录窗并中止
          if (authService.handleLoginRequiredError(err)) {
            return {
              success: true,
              data: { total, filled, failed },
              loginRequired: true
            }
          }
          console.error(`批量补全封面失败 (albumId: ${album.id}, title: ${album.title}):`, err)
          failed++
        }

        // 限流：每次调用间隔 300ms
        if (i < albums.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }

      return { success: true, data: { total, filled, failed } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    } finally {
      coverFillRunning = false
    }
  })

  // ==================== 批量回填缺失发行日期 ====================

  /**
   * 批量回填所有缺失发行日期的专辑
   * 逐个调用 getAlbumDetail 获取 publishTime 并持久化，通过 event 推送进度
   * 仅填充 release_date 为空的专辑；已有日期（含 MB 补全所得）不被覆盖
   * 失败不重试：重跑时仅处理仍缺日期的专辑，天然增量收敛
   */
  ipcMain.handle('album:releaseDateFillStart', async (event) => {
    if (releaseDateFillRunning) {
      return { success: false, error: '发行日期回填正在进行中，请稍后再试' }
    }
    releaseDateFillRunning = true

    try {
      const albums = albumService.getAlbumsWithoutReleaseDate()
      const total = albums.length

      if (total === 0) {
        return { success: true, data: { total: 0, filled: 0, failed: 0 } }
      }

      // 登录前置检查：未登录直接弹登录窗，避免批量无效调用
      const loginStatus = await ncmCliService.getLoginStatus()
      if (!loginStatus.isLoggedIn) {
        authService.triggerLoginPopup()
        return { success: true, data: { total, filled: 0, failed: 0 }, loginRequired: true }
      }

      const sender = event.sender
      let filled = 0
      let failed = 0

      for (let i = 0; i < albums.length; i++) {
        const album = albums[i]

        // 推送进度
        sender.send('album:releaseDateFillProgress', {
          current: i + 1,
          total,
          albumTitle: album.title,
          filled
        })

        try {
          const detail = await ncmCliService.getAlbumDetail(album.netease_album_id)

          if (detail.publishTime) {
            albumService.updateAlbum(album.id, {
              release_date: publishTimeToReleaseDate(detail.publishTime)
            })
            filled++
          } else {
            // 网易云也没有发行日期，无法回填
            failed++
          }
        } catch (err) {
          // 登录失效：弹登录窗并中止
          if (authService.handleLoginRequiredError(err)) {
            return {
              success: true,
              data: { total, filled, failed },
              loginRequired: true
            }
          }
          console.error(`批量回填发行日期失败 (albumId: ${album.id}, title: ${album.title}):`, err)
          failed++
        }

        // 限流：每次调用间隔 300ms
        if (i < albums.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }

      return { success: true, data: { total, filled, failed } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    } finally {
      releaseDateFillRunning = false
    }
  })

  /**
   * 重新同步单张专辑的全部信息（封面 + 发行日期 + 曲目 + 评分 + 风格）
   */
  ipcMain.handle('album:resync', async (event, albumId: number) => {
    try {
      const album = albumService.getAlbumById(albumId)
      if (!album) {
        return { success: false, error: `专辑不存在 (id: ${albumId})` }
      }

      const result = {
        cover_url: album.cover_url,
        tracks_synced: false,
        enrich_matched: false
      }

      // 1. 重新获取封面（顺带补发行日期：仅填充空值，不覆盖已有日期）
      if (album.netease_album_id) {
        try {
          const detail = await ncmCliService.getAlbumDetail(album.netease_album_id)
          if (detail.coverImgUrl) {
            const coverUrl = detail.coverImgUrl.replace(/^http:\/\//, 'https://')
            albumService.updateAlbum(albumId, { cover_url: coverUrl })
            result.cover_url = coverUrl
          }
          if (!album.release_date && detail.publishTime) {
            albumService.updateAlbum(albumId, {
              release_date: publishTimeToReleaseDate(detail.publishTime)
            })
          }
        } catch (err) {
          console.error(`重新获取封面失败 (albumId: ${albumId}):`, err)
        }
      }

      // 2. 重新同步曲目
      if (album.netease_album_id) {
        try {
          // 先清空旧曲目
          trackService.deleteTracksByAlbumId(albumId)
          await trackSyncService.syncTracksByAlbum(albumId, album.netease_album_id)
          result.tracks_synced = true
        } catch (err) {
          console.error(`重新同步曲目失败 (albumId: ${albumId}):`, err)
        }
      }

      // 3. 重新补全评分和风格（MusicBrainz）
      if (isMbClientInitialized()) {
        try {
          ensureMbClient()
          // 重置补全状态以便重新匹配
          // 注意：不清空风格标签——非空风格列表受保护，只能手动修改
          albumService.updateAlbum(albumId, {
            enriched_at: null,
            musicbrainz_id: null,
            mb_rating: null,
            mb_rating_count: null
          })
          const freshAlbum = albumService.getAlbumById(albumId)!
          const mainWindow = BrowserWindow.fromWebContents(event.sender)
          const onFuzzyMatch = createFuzzyMatchCallback(mainWindow)
          const enrichStatus = await enrichService.enrichAlbum(freshAlbum, onFuzzyMatch)
          result.enrich_matched = enrichStatus === 'matched'
        } catch (err) {
          console.error(`重新补全失败 (albumId: ${albumId}):`, err)
        }
      }

      // 4. 返回更新后的完整专辑数据（包括 genres），避免前端重新请求整个列表
      const updatedAlbum = albumService.getAlbumById(albumId)
      return { success: true, data: { ...result, album: updatedAlbum } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 用户评分 ====================

  /**
   * 设置/清除用户评分
   * rating: 0.5~5.0 步长 0.5，或 null 表示清除
   */
  ipcMain.handle(
    'album:setRating',
    async (_event, albumId: number, rating: number | null) => {
      try {
        // 校验评分值
        if (rating !== null) {
          if (typeof rating !== 'number' || rating < 0.5 || rating > 5.0) {
            return { success: false, error: '评分值必须在 0.5~5.0 之间' }
          }
          // 校验步长 0.5
          if (Math.round(rating * 2) !== rating * 2) {
            return { success: false, error: '评分步长必须为 0.5' }
          }
        }

        const album = albumService.getAlbumById(albumId)
        if (!album) {
          return { success: false, error: `专辑不存在 (id: ${albumId})` }
        }

        albumService.updateAlbum(albumId, { user_rating: rating })
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // ==================== 实体介质标记 ====================

  /**
   * 设置/清除实体介质标记（黑胶/CD/磁带，可多选）
   * mediaTypes: 合法枚举数组，或 null 表示清除
   */
  ipcMain.handle(
    'album:setPhysicalMedia',
    async (_event, albumId: number, mediaTypes: string[] | null) => {
      try {
        const VALID_MEDIA_TYPES = ['vinyl', 'cd', 'cassette']
        if (mediaTypes !== null) {
          if (!Array.isArray(mediaTypes)) {
            return { success: false, error: 'mediaTypes 必须是数组或 null' }
          }
          if (mediaTypes.some((m) => !VALID_MEDIA_TYPES.includes(m))) {
            return { success: false, error: `非法介质类型，仅支持 ${VALID_MEDIA_TYPES.join('/')}` }
          }
        }

        const album = albumService.getAlbumById(albumId)
        if (!album) {
          return { success: false, error: `专辑不存在 (id: ${albumId})` }
        }

        // 去重、按展示顺序排序后逗号拼接；空集合存 NULL（语义同未评分）
        const normalized =
          mediaTypes && mediaTypes.length > 0
            ? [...new Set(mediaTypes)]
                .sort((a, b) => VALID_MEDIA_TYPES.indexOf(a) - VALID_MEDIA_TYPES.indexOf(b))
                .join(',')
            : null

        albumService.updateAlbum(albumId, { physical_media: normalized })
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // ==================== 风格统计 ====================

  /**
   * 获取风格统计数据（各风格的专辑数量、收藏总数、有标签的专辑数）
   */
  ipcMain.handle('genre:stats', async () => {
    try {
      const data = albumService.getGenreStats()
      return { success: true, data }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 风格标签管理 ====================

  /**
   * 手动设置专辑的风格标签
   * 替换该专辑的所有风格关联
   */
  ipcMain.handle(
    'album:setGenres',
    async (_event, albumId: number, genres: string[]) => {
      try {
        const album = albumService.getAlbumById(albumId)
        if (!album) {
          return { success: false, error: `专辑不存在 (id: ${albumId})` }
        }

        albumService.setAlbumGenres(albumId, genres)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // ==================== 播放控制 ====================

  /**
   * 后台将剩余曲目串行加入队列（不阻塞 player:playAlbum 返回）
   *
   * 每次 queueAdd = 1 次 ncm-cli 子进程 + 1 次取播放地址 API（约 1 秒/首），
   * 放后台执行避免阻塞播放条出现。每首前检查代际：新一轮播放/停止后
   * 立即中止，避免旧专辑曲目写进新队列。单首失败仅记日志并继续后续
   * （播放已开始，不打断用户，也不弹登录窗）。
   */
  async function fillQueueInBackground(
    generation: number,
    tracks: { netease_song_id: string; netease_original_id: number; title: string }[]
  ): Promise<void> {
    for (const track of tracks) {
      if (generation !== playQueueGeneration) return
      try {
        await ncmCliService.queueAdd(track.netease_song_id, track.netease_original_id)
      } catch (error) {
        console.error(`[playAlbum] 后台补队列失败: ${track.title}:`, error)
      }
    }
  }

  /**
   * 播放整张专辑
   * 清空队列 → 播放第一首 → 确认播放开始 → 立即返回（剩余曲目后台补入，不阻塞返回）
   */
  ipcMain.handle('player:playAlbum', async (_event, albumId: number) => {
    try {
      // 获取专辑的所有曲目
      let tracks = trackService.getTracksByAlbumId(albumId)

      // 本地无曲目，尝试自动拉取
      if (tracks.length === 0) {
        const album = albumService.getAlbumById(albumId)
        if (album && album.netease_album_id) {
          tracks = await trackSyncService.syncTracksByAlbum(albumId, album.netease_album_id)
        }
      }

      if (tracks.length === 0) {
        return { success: false, error: '该专辑没有可播放的曲目' }
      }

      // 过滤出有 netease_song_id 的曲目（谓词收窄类型，后续无需再断言非空）
      const playable = tracks.filter(
        (t): t is Track & { netease_song_id: string; netease_original_id: number } =>
          Boolean(t.netease_song_id) && Boolean(t.netease_original_id)
      )
      if (playable.length === 0) {
        return { success: false, error: '该专辑没有可播放的曲目（缺少歌曲 ID）' }
      }

      // 新一轮播放：使上一轮未完成的后台补队列任务失效
      const generation = ++playQueueGeneration

      // 1. 清空当前队列
      await ncmCliService.queueClear()

      // 2. 播放第一首
      await ncmCliService.playSong(
        playable[0].netease_song_id,
        playable[0].netease_original_id
      )

      // 3. 等待播放器确认开始播放
      const success = await ncmCliService.waitForPlaying()
      if (!success) {
        return { success: false, error: '播放失败' }
      }

      // 4. 剩余曲目后台串行补入（每次 queueAdd 约 1s，不阻塞播放条出现）
      void fillQueueInBackground(generation, playable.slice(1))

      return {
        success: true,
        data: { playing: playable[0].title, totalTracks: playable.length }
      }
    } catch (error) {
      // 检查是否需要登录，如果是则自动打开登录弹窗
      if (authService.handleLoginRequiredError(error)) {
        return { success: false, error: '请先登录网易云音乐账号', loginRequired: true }
      }
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 播放单曲
   * 直接播放指定歌曲，不修改播放队列中的其他曲目
   */
  ipcMain.handle(
    'player:playSong',
    async (_event, encryptedId: string, originalId: number) => {
      try {
        await ncmCliService.playSong(encryptedId, originalId)
        return { success: true }
      } catch (error) {
        // 检查是否需要登录，如果是则自动打开登录弹窗
        if (authService.handleLoginRequiredError(error)) {
          return { success: false, error: '请先登录网易云音乐账号', loginRequired: true }
        }
        return { success: false, error: (error as Error).message }
      }
    }
  )

  /**
   * 播放控制类 handler 的统一执行与错误处理：
   * 登录要求自动弹窗，其余错误返回 { success: false, error }
   */
  async function runPlayerCommand(
    action: () => Promise<unknown>
  ): Promise<{ success: boolean; error?: string; loginRequired?: boolean }> {
    try {
      await action()
      return { success: true }
    } catch (error) {
      if (authService.handleLoginRequiredError(error)) {
        return { success: false, error: '请先登录网易云音乐账号', loginRequired: true }
      }
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * 暂停播放
   */
  ipcMain.handle('player:pause', async () => {
    return runPlayerCommand(() => ncmCliService.pause())
  })

  /**
   * 恢复播放
   */
  ipcMain.handle('player:resume', async () => {
    return runPlayerCommand(() => ncmCliService.resume())
  })

  /**
   * 下一首
   * 队列边界（已是最后一首）不算错误：success: false 附带 boundary 标记与提示文案
   */
  ipcMain.handle('player:next', async () => {
    try {
      const result = await ncmCliService.next()
      if (!result.ok) {
        return { success: false, boundary: true, message: result.message || '无法切换到下一首' }
      }
      return { success: true, message: result.message }
    } catch (error) {
      if (authService.handleLoginRequiredError(error)) {
        return { success: false, error: '请先登录网易云音乐账号', loginRequired: true }
      }
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 上一首（队列边界处理同 next）
   */
  ipcMain.handle('player:prev', async () => {
    try {
      const result = await ncmCliService.prev()
      if (!result.ok) {
        return { success: false, boundary: true, message: result.message || '无法切换到上一首' }
      }
      return { success: true, message: result.message }
    } catch (error) {
      if (authService.handleLoginRequiredError(error)) {
        return { success: false, error: '请先登录网易云音乐账号', loginRequired: true }
      }
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 跳转到指定播放位置（秒）
   */
  ipcMain.handle('player:seek', async (_event, seconds: number) => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
      return { success: false, error: '无效的跳转位置' }
    }
    return runPlayerCommand(() => ncmCliService.seek(seconds))
  })

  /**
   * 设置音量（0-100，越界钳位；ncm-cli 无音量读取命令，仅写不读）
   */
  ipcMain.handle('player:volume', async (_event, level: number) => {
    if (typeof level !== 'number' || !Number.isFinite(level)) {
      return { success: false, error: '无效的音量值' }
    }
    const clamped = Math.min(100, Math.max(0, Math.round(level)))
    return runPlayerCommand(() => ncmCliService.setVolume(clamped))
  })

  /**
   * 查询播放器状态（渲染层轮询用）
   * 查询失败返回 success: false 而非抛错，渲染层保留上次状态继续轮询
   */
  ipcMain.handle('player:state', async () => {
    const state = await ncmCliService.getPlaybackState()
    return { success: state !== null, data: state }
  })

  /**
   * 停止播放（清空播放队列，播放条关闭按钮用）
   */
  ipcMain.handle('player:stop', async () => {
    // 先失效进行中的后台补队列（在途一首先完成、随后被 clear 覆盖），
    // 保证清空后的队列不被旧任务重新填充
    playQueueGeneration++
    return runPlayerCommand(() => ncmCliService.queueClear())
  })

  /**
   * 主动触发单个专辑的曲目同步
   */
  ipcMain.handle('track:syncByAlbum', async (_event, albumId: number) => {
    try {
      const album = albumService.getAlbumById(albumId)
      if (!album) {
        return { success: false, error: `专辑不存在 (id: ${albumId})` }
      }
      if (!album.netease_album_id) {
        return { success: false, error: `专辑缺少 netease_album_id (id: ${albumId})` }
      }

      const tracks = await trackSyncService.syncTracksByAlbum(albumId, album.netease_album_id)
      return { success: true, data: tracks }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 数据补全 ====================

  /**
   * 获取补全状态
   */
  ipcMain.handle('enrich:status', async () => {
    try {
      const unenriched = albumService.getUnenrichedAlbums()
      return {
        success: true,
        data: {
          pending: unenriched.length,
          enriching: enrichService.enriching,
          hasCredentials: hasCredentials() || isMbClientInitialized()
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 手动触发补全
   */
  ipcMain.handle('enrich:start', async (event) => {
    try {
      ensureMbClient()

      const mainWindow = BrowserWindow.fromWebContents(event.sender)
      const result = await enrichAll(mainWindow)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 补全所有缺失 MB 数据的专辑
   */
  ipcMain.handle('enrich:enrichAlbumsWithoutMbData', async (event) => {
    try {
      ensureMbClient()

      const mainWindow = BrowserWindow.fromWebContents(event.sender)
      const result = await enrichAlbumsWithoutMbData(mainWindow)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 重新补全所有专辑（重置后全部重新匹配）
   */
  ipcMain.handle('enrich:reEnrichAll', async (event) => {
    try {
      ensureMbClient()

      const mainWindow = BrowserWindow.fromWebContents(event.sender)
      const result = await reEnrichAll(mainWindow)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== MusicBrainz 凭据管理 ====================

  /**
   * 设置 MusicBrainz 凭据
   */
  ipcMain.handle('mb:setCredentials', async (_event, credentials: MbCredentials) => {
    try {
      saveCredentials(credentials)
      createMbClient(credentials)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 检查 MusicBrainz 凭据状态
   */
  ipcMain.handle('mb:checkCredentials', async () => {
    try {
      return {
        success: true,
        data: {
          configured: hasCredentials(),
          initialized: isMbClientInitialized()
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 清除 MusicBrainz 凭据
   */
  ipcMain.handle('mb:clearCredentials', async () => {
    try {
      clearCredentials()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 应用设置 ====================

  ipcMain.handle('settings:getEnrichStrategies', async () => {
    try {
      const strategies = getEnrichStrategies()
      return { success: true, data: strategies }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('settings:saveEnrichStrategies', async (_event, strategies) => {
    try {
      const settings = loadSettings()
      settings.enrichStrategies = strategies
      saveSettings(settings)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 网易云 API 凭证配置 ====================

  /**
   * 获取网易云 API 凭证配置状态（设置界面只读展示）
   */
  ipcMain.handle('ncm:getCredentialStatus', async () => {
    try {
      const status = await ncmCliService.getCredentialConfigStatus()
      return { success: true, data: status }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 网易云音乐认证 ====================

  /**
   * 获取当前登录状态
   */
  ipcMain.handle('auth:getStatus', async () => {
    try {
      const status = authService.getLoginStatus()
      return { success: true, data: status }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 生成登录二维码
   */
  ipcMain.handle('auth:generateQrcode', async () => {
    try {
      const result = await authService.generateQrcode()
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 检查扫码状态
   */
  ipcMain.handle('auth:checkQrcode', async (_event, key: string) => {
    try {
      const result = await authService.checkQrcodeStatus(key)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 退出登录
   */
  ipcMain.handle('auth:logout', async () => {
    try {
      await authService.logout()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 在线搜索 ====================

  /**
   * 在线搜索专辑（通过 ncm-cli 搜索网易云音乐）
   */
  ipcMain.handle('album:searchOnline', async (_event, keyword: string) => {
    try {
      if (!keyword || keyword.trim().length === 0) {
        return { success: false, error: '请输入搜索关键词' }
      }
      const results = await ncmCliService.searchAlbum(keyword.trim(), 10)
      return { success: true, data: results }
    } catch (error) {
      // 检查是否需要登录
      if (error instanceof NcmLoginRequiredError) {
        return { success: false, error: '请先登录网易云音乐账号', loginRequired: true }
      }
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 添加专辑到收藏（写入数据库 + 自动补全）
   * publish_time 为搜索结果的 publishTime（北京时间零点时间戳），用于写入发行日期
   */
  ipcMain.handle('album:addToCollection', async (_event, album: {
    netease_album_id: string
    netease_original_id: number
    title: string
    artist: string
    cover_url?: string | null
    publish_time?: number | null
  }) => {
    try {
      // 1. 写入数据库（搜索结果的 publishTime 换算为发行日期一并写入）
      const albumId = syncManager.syncSingleAlbum({
        netease_album_id: album.netease_album_id,
        netease_original_id: album.netease_original_id,
        title: album.title,
        artist: album.artist,
        cover_url: album.cover_url,
        release_date: album.publish_time
          ? publishTimeToReleaseDate(album.publish_time)
          : null
      })

      // 2. 自动触发 MusicBrainz 补全（如果客户端可用）
      if (isMbClientInitialized()) {
        try {
          ensureMbClient()
          const freshAlbum = albumService.getAlbumById(albumId)
          if (freshAlbum) {
            await enrichService.enrichAlbum(freshAlbum)
          }
        } catch (enrichError) {
          console.error(`[IPC] 补全专辑失败 (albumId: ${albumId}):`, enrichError)
          // 补全失败不影响添加结果
        }
      }

      return { success: true, data: { albumId } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 获取已收藏专辑的 ID 列表（用于重复检测）
   * 返回 originalIds 和 albumIds 两种 ID
   */
  ipcMain.handle('album:getCollectedNeteaseIds', async () => {
    try {
      const result = albumService.getCollectedNeteaseIds()
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 数据导出/导入 ====================

  ipcMain.handle('db:export', async () => {
    try {
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (!mainWindow) return { success: false, error: '无可用窗口' }

      const now = new Date()
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: '导出数据',
        defaultPath: `album-shelf-export-${dateStr}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (canceled || !filePath) return { success: false, error: '已取消' }

      const data = exportDatabase()
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
      return {
        success: true,
        data: {
          path: filePath,
          albums: data.data.albums.length,
          tracks: data.data.tracks.length
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('db:import', async () => {
    try {
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (!mainWindow) return { success: false, error: '无可用窗口' }

      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: '导入数据',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      })
      if (canceled || filePaths.length === 0) return { success: false, error: '已取消' }

      const content = readFileSync(filePaths[0], 'utf-8')
      const data = JSON.parse(content) as ExportData

      if (!data.version || !data.data || !data.data.albums) {
        return { success: false, error: '无效的导出文件格式' }
      }

      const result = importDatabase(data)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}

/**
 * 退出前停止播放（若播放器仍在播放或暂停）
 *
 * 播放由 ncm-cli 启动的独立播放器进程驱动，不随应用退出而停止。
 * 退出流程（index.ts before-quit）调用本函数：查询播放器状态，
 * 会话存活（playing / paused / 队列非空）时清空队列停止播放；
 * 状态查询失败或未知时不做干预。任何失败仅记录日志，不阻塞退出。
 *
 * 注意：ncm-cli 的 pause 后 state.status 也返回 'stopped'（实测），
 * 因此 paused 判定不可依赖 status，需以 queueLength > 0 兜底识别暂停会话。
 */
export async function stopPlaybackOnQuit(): Promise<void> {
  if (!ncmCliService) {
    return
  }
  try {
    const state = await ncmCliService.getPlaybackState()
    const sessionActive =
      state !== null &&
      (state.status === 'playing' || state.status === 'paused' || state.queueLength > 0)
    if (sessionActive) {
      await ncmCliService.queueClear()
    }
  } catch (error) {
    console.error('[player] 退出前停止播放失败:', error)
  }
}

/**
 * 确保 MusicBrainz 客户端已初始化
 */
function ensureMbClient(): void {
  if (!isMbClientInitialized()) {
    const credentials = loadCredentials()
    if (credentials) {
      createMbClient(credentials)
    } else {
      createMbClient()
    }
  }
}

/**
 * 构建逐条模糊确认回调：将待确认专辑入队，由消费器串行弹窗，不阻塞批量补全流程
 */
function createFuzzyMatchCallback(mainWindow: BrowserWindow | null) {
  return (album: Album, candidates: MbFuzzyCandidate[]) => {
    fuzzyConfirmQueue.push({ album, candidates })
    void drainFuzzyConfirmQueue(mainWindow)
  }
}

/**
 * 弹窗队列消费器：依次弹出确认弹窗，等待用户回复后异步结算。
 * fuzzyDialogDraining 标志保证同一时刻只有一个消费器（即最多一个弹窗）。
 */
async function drainFuzzyConfirmQueue(mainWindow: BrowserWindow | null): Promise<void> {
  if (fuzzyDialogDraining) return
  fuzzyDialogDraining = true
  try {
    while (fuzzyConfirmQueue.length > 0) {
      const item = fuzzyConfirmQueue.shift()!
      const reply = await showFuzzyConfirmDialog(mainWindow, item)
      await enrichService.confirmFuzzyMatch(item.album, item.candidates, reply)

      // 通知渲染层刷新列表与风格统计
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('enrich:fuzzy-resolved', {
          albumId: item.album.id,
          albumTitle: item.album.title,
          confirmed: reply !== null
        })
      }
    }
  } finally {
    fuzzyDialogDraining = false
  }
}

/**
 * 弹出单张专辑的模糊确认弹窗，等待用户回复。
 * 窗口销毁时以 null（跳过）结算，避免队列悬挂。
 */
function showFuzzyConfirmDialog(
  mainWindow: BrowserWindow | null,
  item: FuzzyConfirmQueueItem
): Promise<{ mbid: string } | null> {
  const { album, candidates } = item

  return new Promise<{ mbid: string } | null>(async (resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve(null)
      return
    }

    // 获取网易云封面 URL（优先数据库缓存，其次实时获取）
    let coverUrl: string | null = album.cover_url ?? null
    if (!coverUrl && album.netease_album_id) {
      try {
        const detail = await ncmCliService.getAlbumDetail(album.netease_album_id)
        if (detail.coverImgUrl) {
          coverUrl = detail.coverImgUrl.replace(/^http:\/\//, 'https://')
          // 持久化到数据库
          albumService.updateAlbum(album.id, { cover_url: coverUrl })
        }
      } catch (err) {
        console.error(`获取封面失败 (albumId: ${album.id}):`, err)
      }
    }

    // 封面获取期间窗口可能已销毁
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve(null)
      return
    }

    let settled = false
    const finish = (reply: { mbid: string } | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(reply)
    }

    const onReply = (_event: Electron.IpcMainEvent, reply: { mbid: string } | null) => {
      finish(reply)
    }
    const onWindowDestroyed = () => finish(null)

    const cleanup = () => {
      ipcMain.removeListener('enrich:fuzzy-confirm-reply', onReply)
      mainWindow?.webContents.removeListener('destroyed', onWindowDestroyed)
    }

    ipcMain.once('enrich:fuzzy-confirm-reply', onReply)
    mainWindow.webContents.once('destroyed', onWindowDestroyed)

    // 发送候选到前端（pendingCount 为队列中剩余的待确认数量）
    mainWindow.webContents.send('enrich:fuzzy-confirm-request', {
      albumId: album.id,
      albumTitle: album.title,
      albumArtist: album.artist,
      coverUrl,
      candidates,
      pendingCount: fuzzyConfirmQueue.length
    })
  })
}

/**
 * 执行批量补全，发送进度到渲染进程，模糊匹配入队依次确认
 */
async function enrichAll(mainWindow: BrowserWindow | null) {
  const result = await enrichService.enrichAll(
    (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('enrich:progress', progress)
      }
    },
    createFuzzyMatchCallback(mainWindow)
  )
  return result
}

/**
 * 补全所有缺失 MB 数据的专辑，发送进度到渲染进程，模糊匹配入队依次确认
 */
async function enrichAlbumsWithoutMbData(mainWindow: BrowserWindow | null) {
  const result = await enrichService.enrichAlbumsWithoutMbData(
    (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('enrich:progress', progress)
      }
    },
    createFuzzyMatchCallback(mainWindow)
  )
  return result
}

/**
 * 执行全量重新补全，发送进度到渲染进程，模糊匹配入队依次确认
 */
async function reEnrichAll(mainWindow: BrowserWindow | null) {
  const result = await enrichService.reEnrichAll(
    (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('enrich:progress', progress)
      }
    },
    createFuzzyMatchCallback(mainWindow)
  )
  return result
}
