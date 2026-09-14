import { getMbClient } from './enrich/mb-client'
import { AlbumService, type GenreLibraryEntry } from './album-service'

/**
 * MusicBrainz 风格库同步服务
 *
 * 把 MB 官方受控风格词表（https://musicbrainz.org/genres 所列，实测 2201 个）
 * 全量并入本地 `genre` 表，让手动给专辑分配风格时能在编辑框里搜到全部 MB 风格，
 * 而不必手工改库 + 重启应用。
 *
 * 数据源：WS/2 `GET /genre/all?fmt=json&limit=100&offset=N`（分页，23 页/2201 条）。
 * 复用 musicbrainz-api 的 `restGet()`，自动走既有的 1 req/s 限流与 User-Agent。
 *
 * 写入由 `AlbumService.mergeGenreLibrary` 负责，本服务只做拉取、分页、重试与统计。
 *
 * 两条关键约束（详见 openspec/changes/2026-09-14-sync-mb-genre-library/design.md）：
 *  1. 只增不改不删 —— 不 DELETE genre / album_genre，不 UPDATE genre.name，
 *     已有专辑↔风格的映射零风险；
 *  2. 幂等可重跑 —— 失败中止时保留已写入部分，重跑从 offset 0 重新拉全量，
 *     已存在的行只会被认作 existing，不会产生重复。
 */

/** WS/2 `GET /genre/all` 的单页响应（注意：这里的 genre 对象没有 count 字段） */
interface IMbGenreListResponse {
  'genre-count': number
  'genre-offset': number
  genres: {
    id: string
    name: string
    disambiguation?: string
  }[]
}

export interface GenreLibrarySyncProgress {
  /** 已处理风格数 */
  current: number
  /** 风格总数（MB 返回的 genre-count） */
  total: number
  /** 累计新增 */
  added: number
  /** 累计已存在（本地已有该风格） */
  existing: number
}

export interface GenreLibrarySyncResult {
  added: number
  existing: number
  total: number
  /** 是否因拉取失败中途中止（已写入部分保留，重跑即续） */
  aborted: boolean
  /** 中止原因（aborted 为 true 时有值） */
  error?: string
}

/** MB WS/2 分页上限 */
const PAGE_SIZE = 100
/** 单页最大尝试次数（含首次） */
const MAX_ATTEMPTS = 4
/**
 * 页级重试退避间隔。
 *
 * 库内建重试对 429/503 生效但间隔固定 500ms（node_modules/musicbrainz-api/lib/http-client.js），
 * 实测 MB 持续限流下 10 次重试仍会耗尽（23 页撞到 7 次 503），故在此加一层更长的退避。
 */
const RETRY_DELAYS_MS = [2000, 5000, 10000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class GenreLibraryService {
  private albumService: AlbumService
  private syncing = false

  constructor(albumService: AlbumService) {
    this.albumService = albumService
  }

  get isSyncing(): boolean {
    return this.syncing
  }

  /**
   * 全量同步 MB 风格库。
   *
   * @param onProgress 每页写入完成后回调一次（含最后一页），用于驱动进度条
   */
  async sync(
    onProgress?: (progress: GenreLibrarySyncProgress) => void
  ): Promise<GenreLibrarySyncResult> {
    if (this.syncing) {
      throw new Error('风格库同步正在进行中，请勿重复触发。')
    }

    this.syncing = true

    let added = 0
    let existing = 0
    let total = 0
    let offset = 0

    try {
      while (true) {
        let page: IMbGenreListResponse
        try {
          page = await this.fetchPage(offset)
        } catch (error) {
          // 中止但保留已写入的增量（幂等，重跑即续），不做回滚
          console.error(`[GenreLibrary] 风格库同步中止（offset=${offset}）:`, error)
          return {
            added,
            existing,
            total,
            aborted: true,
            error: error instanceof Error ? error.message : String(error)
          }
        }

        total = page['genre-count'] ?? total

        const entries: GenreLibraryEntry[] = page.genres.map((g) => ({
          name: g.name,
          mbGenreId: g.id
        }))
        const written = this.albumService.mergeGenreLibrary(entries)
        added += written.added
        existing += written.existing

        offset += page.genres.length
        onProgress?.({ current: offset, total, added, existing })

        // 空页兜底退出，避免 offset 不前进时死循环
        if (page.genres.length === 0 || offset >= total) break
      }

      return { added, existing, total, aborted: false }
    } finally {
      this.syncing = false
    }
  }

  /**
   * 拉取单页，失败时退避重试；全部尝试失败后抛出最后一次错误。
   */
  private async fetchPage(offset: number): Promise<IMbGenreListResponse> {
    const mbApi = getMbClient()
    let lastError: unknown = new Error('未知错误')

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await mbApi.restGet<IMbGenreListResponse>('/genre/all', {
          limit: String(PAGE_SIZE),
          offset: String(offset)
        })
      } catch (error) {
        lastError = error
        const delay = RETRY_DELAYS_MS[attempt]
        if (delay === undefined) break
        console.warn(
          `[GenreLibrary] 第 ${offset / PAGE_SIZE + 1} 页拉取失败（第 ${attempt + 1} 次尝试），${delay}ms 后重试:`,
          error instanceof Error ? error.message : error
        )
        await sleep(delay)
      }
    }

    throw lastError
  }
}
