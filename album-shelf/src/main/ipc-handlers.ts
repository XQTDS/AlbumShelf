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
      if (!isMbClientInitialized()) {
        // 尝试加载凭据
        const credentials = loadCredentials()
        if (credentials) {
          createMbClient(credentials)
        } else {
          // 即使没有凭据，也创建无认证的客户端（搜索和 lookup 不需要认证）
          createMbClient()
        }
      }

      const mainWindow = BrowserWindow.fromWebContents(event.sender)
      const result = await enrichAll(mainWindow)
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
 * 执行批量补全，发送进度到渲染进程
 */
async function enrichAll(mainWindow: BrowserWindow | null) {
  const result = await enrichService.enrichAll((progress) => {
    // 通过 IPC 发送进度到渲染进程
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('enrich:progress', progress)
    }
  })
  return result
}
