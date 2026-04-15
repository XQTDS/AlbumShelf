import { SyncService } from './sync-service'
import { AlbumService, AlbumInsert } from '../album-service'
import { writeNeteaseIdsToCsv, AlbumWithNeteaseId } from './csv-writer'

export interface SyncResult {
  /** 本次同步新增的专辑数量 */
  added: number
  /** 本次同步跳过（已存在）的专辑数量 */
  skipped: number
  /** 同步源返回的专辑总数 */
  total: number
}

/**
 * SyncManager - 同步管理器
 *
 * 负责调用 SyncService 获取专辑列表，通过 netease_album_id 增量去重写入数据库。
 */
export class SyncManager {
  private syncService: SyncService
  private albumService: AlbumService
  private isSyncing = false

  constructor(syncService: SyncService, albumService: AlbumService) {
    this.syncService = syncService
    this.albumService = albumService
  }

  /**
   * 执行同步操作
   * - 从同步源获取收藏专辑列表
   * - 通过 netease_album_id 增量去重写入数据库
   * - 回写 netease_id 到 CSV 文件
   * - 返回同步结果统计
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('同步正在进行中，请勿重复触发。')
    }

    this.isSyncing = true

    try {
      // 1. 从同步源获取专辑列表
      const neteaseAlbums = await this.syncService.fetchCollectedAlbums()
      const now = new Date().toISOString()

      let added = 0
      let skipped = 0

      // 2. 逐个检查并写入数据库（通过 netease_album_id 去重）
      const albumsToInsert: AlbumInsert[] = []
      const albumsForCsvWriteback: AlbumWithNeteaseId[] = []

      for (const album of neteaseAlbums) {
        const existing = this.albumService.getAlbumByNeteaseAlbumId(album.netease_album_id)
        if (existing) {
          skipped++
        } else {
          albumsToInsert.push({
            netease_album_id: album.netease_album_id,
            netease_original_id: album.netease_original_id ?? null,
            title: album.title,
            artist: album.artist,
            cover_url: album.cover_url ?? null,
            release_date: album.release_date ?? null,
            track_count: album.track_count ?? null,
            synced_at: now
          })
          added++
        }

        // 收集所有专辑用于 CSV 回写
        albumsForCsvWriteback.push({
          title: album.title,
          artist: album.artist,
          netease_id: album.netease_album_id
        })
      }

      // 3. 批量插入新专辑
      if (albumsToInsert.length > 0) {
        this.albumService.insertAlbums(albumsToInsert)
      }

      // 4. 回写 netease_id 到 CSV 文件
      try {
        writeNeteaseIdsToCsv(albumsForCsvWriteback)
      } catch (error) {
        console.error('CSV 回写失败:', error)
        // 回写失败不影响同步结果
      }

      return {
        added,
        skipped,
        total: neteaseAlbums.length
      }
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * 检查同步源的登录状态
   */
  async checkLoginStatus(): Promise<boolean> {
    return this.syncService.checkLoginStatus()
  }

  /**
   * 是否正在同步
   */
  get syncing(): boolean {
    return this.isSyncing
  }
}