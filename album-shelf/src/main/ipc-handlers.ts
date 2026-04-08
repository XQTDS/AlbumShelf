import { ipcMain, BrowserWindow } from 'electron'
import { AlbumService, AlbumQueryOptions } from './album-service'
import { TrackService } from './track-service'
import { NcmCliService } from './ncm-cli-service'
import { TrackSyncService } from './track-sync-service'
import { SyncManager } from './sync/sync-manager'
import { MockSyncService } from './sync/mock-sync-service'
import {
  EnrichService,
  createMbClient,
  loadCredentials,
  saveCredentials,
  hasCredentials,
  clearCredentials,
  isMbClientInitialized,
  type MbCredentials
} from './enrich'

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
   * 返回同步结果统计
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
  ipcMain.handle('album:resync', async (_event, albumId: number) => {
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
          result.enrich_matched = await enrichService.enrichAlbum(freshAlbum)
        } catch (err) {
          console.error(`重新补全失败 (albumId: ${albumId}):`, err)
        }
      }

      return { success: true, data: result }
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
      await ncmCliService.waitForPlaying()

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
    } catch (error) {
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
 * 执行批量补全，发送进度到渲染进程
 */
async function enrichAll(mainWindow: BrowserWindow | null) {
  const result = await enrichService.enrichAll((progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('enrich:progress', progress)
    }
  })
  return result
}

/**
 * 执行全量重新补全，发送进度到渲染进程
 */
async function reEnrichAll(mainWindow: BrowserWindow | null) {
  const result = await enrichService.reEnrichAll((progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('enrich:progress', progress)
    }
  })
  return result
}
