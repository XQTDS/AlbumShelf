import { ipcMain, BrowserWindow } from 'electron'
import { AlbumService, AlbumQueryOptions } from './album-service'
import { TrackService } from './track-service'
import { NcmCliService } from './ncm-cli-service'
import { TrackSyncService } from './track-sync-service'
import { SyncManager } from './sync/sync-manager'
import { MockSyncService } from './sync/mock-sync-service'
import { updateNeteaseIdInCsv } from './sync/csv-writer'
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
  type MbCredentials
} from './enrich'
import * as authService from './auth-service'
import { NcmLoginRequiredError } from './ncm-cli-service'

let albumService: AlbumService
let trackService: TrackService
let ncmCliService: NcmCliService
let trackSyncService: TrackSyncService
let syncManager: SyncManager
let enrichService: EnrichService

/**
 * 初始化所有服务实例
 */
function initServices(): void {
  albumService = new AlbumService()
  trackService = new TrackService()
  ncmCliService = new NcmCliService()
  trackSyncService = new TrackSyncService(ncmCliService, trackService, albumService)

  // 当前使用 MockSyncService，待 ncm-cli 支持后切换
  const syncService = new MockSyncService()
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

  // ==================== 同步操作 ====================

  /**
   * 触发同步操作
   * 返回同步结果统计（包含待确认的模糊匹配列表）
   */
  ipcMain.handle('sync:start', async () => {
    try {
      const result = await syncManager.sync()

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

  /**
   * 确认模糊匹配的专辑
   * 用户确认后将专辑写入数据库并更新 CSV
   */
  ipcMain.handle('sync:confirmFuzzyMatches', async (_event, confirmedMatches: Array<{
    originalTitle: string
    matchedTitle: string
    artist: string
    neteaseId: string
  }>) => {
    try {
      const addedCount = await syncManager.confirmFuzzyMatches(confirmedMatches)

      // 如果有新增专辑且 MB 客户端已初始化，自动触发补全
      if (addedCount > 0 && isMbClientInitialized()) {
        const mainWindow = BrowserWindow.getAllWindows()[0]
        enrichAll(mainWindow).catch((err) =>
          console.error('自动补全失败:', err)
        )
      }

      return { success: true, data: { added: addedCount } }
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

  /**
   * 重新同步单张专辑的全部信息（封面 + 曲目 + 评分 + 风格）
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

      // 1. 重新获取封面
      if (album.netease_album_id) {
        try {
          const detail = await ncmCliService.getAlbumDetail(album.netease_album_id)
          if (detail.coverImgUrl) {
            const coverUrl = detail.coverImgUrl.replace(/^http:\/\//, 'https://')
            albumService.updateAlbum(albumId, { cover_url: coverUrl })
            result.cover_url = coverUrl
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
          albumService.updateAlbum(albumId, {
            enriched_at: null,
            musicbrainz_id: null,
            mb_rating: null,
            mb_rating_count: null
          })
          albumService.setAlbumGenres(albumId, [])
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
   * 播放整张专辑
   * 清空队列 → 播放第一首 → 等待播放开始 → 将剩余曲目加入队列
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

      // 过滤出有 netease_song_id 的曲目
      const playable = tracks.filter((t) => t.netease_song_id && t.netease_original_id)
      if (playable.length === 0) {
        return { success: false, error: '该专辑没有可播放的曲目（缺少歌曲 ID）' }
      }

      // 1. 清空当前队列
      await ncmCliService.queueClear()

      // 2. 播放第一首
      await ncmCliService.playSong(
        playable[0].netease_song_id!,
        playable[0].netease_original_id!
      )

      // 3. 等待播放器确认开始播放
      let success = await ncmCliService.waitForPlaying()
      if (success) {
        // 4. 将剩余曲目按顺序加入队列
        for (let i = 1; i < playable.length; i++) {
          await ncmCliService.queueAdd(
            playable[i].netease_song_id!,
            playable[i].netease_original_id!
          )
        }

        return {
          success: true,
          data: { playing: playable[0].title, totalTracks: playable.length }
        }
      }

      return { success: false, error: '播放失败' }
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
   * 添加专辑到收藏（写入 CSV + 同步到数据库 + 自动补全）
   */
  ipcMain.handle('album:addToCollection', async (_event, album: {
    netease_album_id: string
    netease_original_id: number
    title: string
    artist: string
    cover_url?: string | null
  }) => {
    try {
      // 1. 追加到 CSV 并同步到数据库
      const albumId = syncManager.addAlbumToCollection(album)

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

  // ==================== 专辑 ID 校验与修复 ====================

  /**
   * 通过 albumId 获取专辑详情（用于手动输入 ID 校验）
   */
  ipcMain.handle('album:getDetailById', async (_event, albumId: string) => {
    try {
      const detail = await ncmCliService.getAlbumDetail(albumId)
      return { success: true, data: detail }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 批量校验所有专辑的 netease_album_id 正确性
   * 逐个调用 getAlbumDetail 比较 title，通过 event 推送进度
   * 返回不匹配的专辑列表
   */
  ipcMain.handle('album:verifyIds', async (event) => {
    try {
      const albums = albumService.getAllAlbumsForEnrich()
      const albumsWithId = albums.filter((a) => a.netease_album_id)
      const total = albumsWithId.length

      if (total === 0) {
        return { success: true, data: { mismatches: [], errors: [], total: 0 } }
      }

      const mismatches: Array<{
        albumId: number
        localTitle: string
        localArtist: string
        remoteTitle: string
        remoteArtist: string
        neteaseAlbumId: string
      }> = []

      const errors: Array<{
        albumId: number
        localTitle: string
        localArtist: string
        error: string
      }> = []

      const sender = event.sender

      for (let i = 0; i < albumsWithId.length; i++) {
        const album = albumsWithId[i]

        // 推送进度
        sender.send('album:verifyProgress', { current: i + 1, total })

        try {
          const detail = await ncmCliService.getAlbumDetail(album.netease_album_id)

          // 忽略大小写 + trim 后精确匹配
          const localTitle = album.title.trim().toLowerCase()
          const remoteTitle = detail.name.trim().toLowerCase()

          if (localTitle !== remoteTitle) {
            // 获取远程艺术家名
            const remoteArtist = detail.artists && detail.artists.length > 0
              ? detail.artists.map((a) => a.name).join(' / ')
              : ''

            mismatches.push({
              albumId: album.id,
              localTitle: album.title,
              localArtist: album.artist,
              remoteTitle: detail.name,
              remoteArtist,
              neteaseAlbumId: album.netease_album_id
            })
          }
        } catch (err) {
          errors.push({
            albumId: album.id,
            localTitle: album.title,
            localArtist: album.artist,
            error: (err as Error).message
          })
        }

        // 限流：每次调用间隔 300ms
        if (i < albumsWithId.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }

      return { success: true, data: { mismatches, errors, total } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 修复单张专辑的 netease_album_id
   * 更新 ID + title → 清除旧曲目并重新同步 → 重新获取封面 → 回写 CSV
   */
  ipcMain.handle('album:fixId', async (_event, params: {
    albumId: number
    newNeteaseAlbumId: string
    newOriginalId: number
    newTitle: string
  }) => {
    try {
      const { albumId, newNeteaseAlbumId, newOriginalId, newTitle } = params
      const album = albumService.getAlbumById(albumId)
      if (!album) {
        return { success: false, error: `专辑不存在 (id: ${albumId})` }
      }

      // 1. 更新 netease_album_id + title
      albumService.updateNeteaseAlbumId(albumId, newNeteaseAlbumId, newOriginalId, newTitle)

      // 2. 清除旧曲目并重新同步
      try {
        trackService.deleteTracksByAlbumId(albumId)
        await trackSyncService.syncTracksByAlbum(albumId, newNeteaseAlbumId)
      } catch (err) {
        console.error(`[album:fixId] 重新同步曲目失败 (albumId: ${albumId}):`, err)
      }

      // 3. 重新获取封面
      try {
        const detail = await ncmCliService.getAlbumDetail(newNeteaseAlbumId)
        if (detail.coverImgUrl) {
          const coverUrl = detail.coverImgUrl.replace(/^http:\/\//, 'https://')
          albumService.updateAlbum(albumId, { cover_url: coverUrl })
        }
      } catch (err) {
        console.error(`[album:fixId] 重新获取封面失败 (albumId: ${albumId}):`, err)
      }

      // 4. 回写 CSV
      try {
        updateNeteaseIdInCsv(album.title, album.artist, newNeteaseAlbumId)
      } catch (err) {
        console.error(`[album:fixId] CSV 回写失败 (albumId: ${albumId}):`, err)
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
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
 * 构建逐条模糊确认回调：通过 IPC 与渲染进程交互
 */
function createFuzzyMatchCallback(mainWindow: BrowserWindow | null) {
  if (!mainWindow || mainWindow.isDestroyed()) return undefined

  return async (album: { id: number; title: string; artist: string; netease_album_id?: string | null; cover_url?: string | null }, candidates: unknown[]) => {
    return new Promise<{ mbid: string } | null>(async (resolve) => {
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

      // 发送候选到前端
      mainWindow.webContents.send('enrich:fuzzy-confirm-request', {
        albumId: album.id,
        albumTitle: album.title,
        albumArtist: album.artist,
        coverUrl,
        candidates
      })

      // 监听前端回复（一次性）
      ipcMain.once('enrich:fuzzy-confirm-reply', (_event, reply: { mbid: string } | null) => {
        resolve(reply)
      })
    })
  }
}

/**
 * 执行批量补全，发送进度到渲染进程，逐条确认模糊匹配
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
 * 补全所有缺失 MB 数据的专辑，发送进度到渲染进程，逐条确认模糊匹配
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
 * 执行全量重新补全，发送进度到渲染进程，逐条确认模糊匹配
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
