import { SyncService, FuzzyMatchAlbum } from './sync-service'
import { AlbumService, AlbumInsert } from '../album-service'
import { writeNeteaseIdsToCsv, updateAlbumTitleInCsv, AlbumWithNeteaseId } from './csv-writer'

export interface SyncResult {
  /** 本次同步新增的专辑数量 */
  added: number
  /** 本次同步跳过（已存在）的专辑数量 */
  skipped: number
  /** 同步源返回的专辑总数 */
  total: number
  /** 需要用户确认的模糊匹配专辑 */
  fuzzyMatches: FuzzyMatchAlbum[]
}

/** 用户确认的模糊匹配结果 */
export interface ConfirmedFuzzyMatch {
  /** CSV 中的原始专辑名 */
  originalTitle: string
  /** 网易云返回的专辑名（用户确认后使用这个） */
  matchedTitle: string
  /** 艺术家名 */
  artist: string
  /** 网易云专辑 ID */
  neteaseId: string
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
   * - 返回同步结果统计（包含待确认的模糊匹配）
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('同步正在进行中，请勿重复触发。')
    }

    this.isSyncing = true

    try {
      // 1. 从同步源获取专辑列表（包含精确匹配和模糊匹配）
      const { albums: neteaseAlbums, fuzzyMatches } = await this.syncService.fetchCollectedAlbums()
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
        total: neteaseAlbums.length,
        fuzzyMatches
      }
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * 确认模糊匹配的专辑
   * - 将专辑写入数据库
   * - 更新 CSV 中的专辑名和 netease_id
   * @param confirmedMatches 用户确认的模糊匹配列表
   * @returns 成功添加的专辑数量
   */
  async confirmFuzzyMatches(confirmedMatches: ConfirmedFuzzyMatch[]): Promise<number> {
    if (confirmedMatches.length === 0) return 0

    const now = new Date().toISOString()
    const albumsToInsert: AlbumInsert[] = []

    for (const match of confirmedMatches) {
      // 检查是否已存在
      const existing = this.albumService.getAlbumByNeteaseAlbumId(match.neteaseId)
      if (existing) {
        console.log(`[SyncManager] 跳过已存在的专辑: ${match.matchedTitle}`)
        continue
      }

      // 使用网易云返回的专辑名（用户确认后的）
      albumsToInsert.push({
        netease_album_id: match.neteaseId,
        netease_original_id: null,
        title: match.matchedTitle, // 使用网易云的专辑名
        artist: match.artist,
        cover_url: null,
        release_date: null,
        track_count: null,
        synced_at: now
      })
    }

    // 批量插入数据库
    if (albumsToInsert.length > 0) {
      this.albumService.insertAlbums(albumsToInsert)
    }

    // 更新 CSV 文件：修正专辑名并写入 netease_id
    for (const match of confirmedMatches) {
      try {
        updateAlbumTitleInCsv(match.originalTitle, match.artist, match.matchedTitle, match.neteaseId)
        console.log(`[SyncManager] 已更新 CSV: "${match.originalTitle}" -> "${match.matchedTitle}"`)
      } catch (error) {
        console.error(`[SyncManager] 更新 CSV 失败: ${match.originalTitle}`, error)
      }
    }

    console.log(`[SyncManager] 确认模糊匹配完成: 添加 ${albumsToInsert.length} 张专辑`)
    return albumsToInsert.length
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