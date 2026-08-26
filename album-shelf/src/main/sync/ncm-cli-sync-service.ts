import { SyncService, NeteaseAlbum } from './sync-service'
import { NcmCliService, NcmCliCollectedAlbum, publishTimeToReleaseDate } from '../ncm-cli-service'

/** 每页拉取数量（ncm-cli 0.1.6 实测 limit 过小时可能返回 HTTP 400，固定 50） */
const PAGE_SIZE = 50

/** 翻页安全上限（10000 张），防止异常情况下无限翻页 */
const MAX_PAGES = 200

/** 单页失败重试次数 */
const PAGE_RETRY_COUNT = 2

/** 单页重试间隔（毫秒） */
const PAGE_RETRY_DELAY_MS = 1000

/**
 * NcmCliSyncService - 通过 ncm-cli album collected 获取网易云收藏专辑
 *
 * 直接调用 ncm-cli 0.1.6+ 的 `album collected` 命令分页拉取用户收藏的专辑列表，
 * 无需 CSV 文件，也无需逐张搜索匹配。
 */
export class NcmCliSyncService implements SyncService {
  private ncmCliService: NcmCliService

  constructor(ncmCliService?: NcmCliService) {
    this.ncmCliService = ncmCliService || new NcmCliService()
  }

  async fetchCollectedAlbums(onProgress?: (fetched: number) => void): Promise<NeteaseAlbum[]> {
    const albums: NeteaseAlbum[] = []
    let offset = 0
    let pageCount = 0

    while (true) {
      pageCount++
      if (pageCount > MAX_PAGES) {
        console.warn(
          `[NcmCliSyncService] 翻页超过安全上限 ${MAX_PAGES} 页，停止拉取（已获取 ${albums.length} 张）`
        )
        break
      }

      const response = await this.fetchPageWithRetry(offset)
      const records = response.records || []

      // 翻页终止条件：返回空页。
      // 注意不能依赖 recordCount（实测恒为 0），也不能依赖 records.length < PAGE_SIZE
      // （实测存在单页少于 limit 但仍有下一页的情况）。
      if (records.length === 0) {
        break
      }

      for (const record of records) {
        albums.push(this.toNeteaseAlbum(record))
      }

      // 每页拉取完成后推送进度（翻页频率约 1 秒/页，事件频次天然受网络限流）
      onProgress?.(albums.length)

      console.log(
        `[NcmCliSyncService] 已拉取 ${albums.length} 张收藏专辑（第 ${pageCount} 页）`
      )

      offset += PAGE_SIZE
    }

    console.log(`[NcmCliSyncService] 收藏专辑拉取完成，共 ${albums.length} 张`)
    return albums
  }

  /**
   * 拉取单页数据，失败时重试
   */
  private async fetchPageWithRetry(offset: number) {
    let lastError: unknown
    for (let attempt = 0; attempt <= PAGE_RETRY_COUNT; attempt++) {
      try {
        return await this.ncmCliService.getCollectedAlbumsPage(PAGE_SIZE, offset)
      } catch (error) {
        lastError = error
        console.warn(
          `[NcmCliSyncService] 拉取收藏专辑第 ${offset / PAGE_SIZE + 1} 页失败（第 ${attempt + 1} 次尝试）:`,
          error
        )
        if (attempt < PAGE_RETRY_COUNT) {
          await new Promise((resolve) => setTimeout(resolve, PAGE_RETRY_DELAY_MS))
        }
      }
    }
    throw new Error(
      `拉取收藏专辑列表失败（offset: ${offset}）: ${(lastError as Error)?.message ?? String(lastError)}`
    )
  }

  /**
   * 将 ncm-cli 收藏专辑记录映射为 NeteaseAlbum
   */
  private toNeteaseAlbum(record: NcmCliCollectedAlbum): NeteaseAlbum {
    return {
      netease_album_id: record.id,
      netease_original_id: record.originalId,
      title: record.name,
      artist: record.artists.map((artist) => artist.name).join(' / '),
      // 结构化真源与展示文本同源派生（相邻两行，不会漂移）；JSON 序列化交给持久化层
      artists: record.artists.map((artist) => ({
        name: artist.name,
        originalId: artist.originalId,
        id: artist.id
      })),
      cover_url: record.coverImgUrl ?? undefined,
      release_date: record.publishTime
        ? publishTimeToReleaseDate(record.publishTime)
        : undefined,
      // album collected 接口不返回曲目数量
      track_count: undefined
    }
  }

  async checkLoginStatus(): Promise<boolean> {
    const status = await this.ncmCliService.getLoginStatus()
    return status.isLoggedIn
  }
}
