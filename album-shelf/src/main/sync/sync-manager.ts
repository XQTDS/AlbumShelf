import { SyncService } from './sync-service'
import { AlbumService, AlbumInsert } from '../album-service'

export interface SyncResult {
  /** 本次同步新增的专辑数量 */
  added: number
  /** 本次同步跳过（已存在）的专辑数量 */
  skipped: number
  /** 本次同步删除（本地有但网易云收藏列表中已没有）的专辑数量 */
  deleted: number
  /** 同步源返回的专辑总数 */
  total: number
}

/**
 * SyncManager - 同步管理器
 *
 * 负责调用 SyncService 获取收藏专辑列表，通过 netease_album_id 增量去重写入数据库。
 * - 已存在于数据库的专辑仅计数跳过，不修改任何字段
 * - 本地有但收藏列表中已没有的专辑会被删除（含曲目/风格级联清理）
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
   * - 通过 netease_album_id 增量去重写入数据库（已存在专辑不改动）
   * - 返回同步结果统计
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('同步正在进行中，请勿重复触发。')
    }

    this.isSyncing = true

    try {
      // 1. 从同步源获取收藏专辑列表（完整拉取，失败则整体中止，不执行删除）
      const neteaseAlbums = await this.syncService.fetchCollectedAlbums()
      const now = new Date().toISOString()

      let added = 0
      let skipped = 0

      // 2. 逐个检查并写入数据库（通过 netease_album_id 去重，已存在的不修改）
      const albumsToInsert: AlbumInsert[] = []

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
      }

      // 3. 批量插入新专辑
      if (albumsToInsert.length > 0) {
        this.albumService.insertAlbums(albumsToInsert)
      }

      // 4. 删除本地有但收藏列表中已没有的专辑（先增后删：新增失败则不会误删）
      const onlineIds = new Set(neteaseAlbums.map((album) => album.netease_album_id))
      const { albumIds: dbAlbumIds } = this.albumService.getCollectedNeteaseIds()
      const missingIds = dbAlbumIds.filter((id) => !onlineIds.has(id))
      const deleted = missingIds.length > 0
        ? this.albumService.deleteAlbumsByNeteaseAlbumIds(missingIds)
        : 0
      if (deleted > 0) {
        console.log(`[SyncManager] 同步清理：删除 ${deleted} 张已不在收藏列表中的专辑`)
      }

      return {
        added,
        skipped,
        deleted,
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

  /**
   * 同步单张专辑到数据库
   * 用于搜索添加场景，直接传入专辑信息写入数据库
   * @param album 专辑信息（release_date 由调用方提供，如搜索结果的 publishTime 换算值）
   * @returns 新增的专辑 ID，如果已存在则返回已有 ID
   */
  syncSingleAlbum(album: {
    netease_album_id: string
    netease_original_id: number
    title: string
    artist: string
    cover_url?: string | null
    release_date?: string | null
  }): number {
    const now = new Date().toISOString()

    // 写入数据库（insertAlbum 会自动去重）
    const albumId = this.albumService.insertAlbum({
      netease_album_id: album.netease_album_id,
      netease_original_id: album.netease_original_id,
      title: album.title,
      artist: album.artist,
      cover_url: album.cover_url ?? null,
      release_date: album.release_date ?? null,
      track_count: null,
      synced_at: now
    })

    return albumId
  }
}
