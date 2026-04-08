import { getMbClient } from './mb-client'
import { AlbumService, Album } from '../album-service'
import type { IReleaseGroupMatch, IRating } from 'musicbrainz-api'

/**
 * MusicBrainz Genre 条目（官方审核的风格分类）
 */
interface IMbGenre {
  id: string
  name: string
  count: number
  disambiguation: string
}

/**
 * MusicBrainz 匹配结果
 */
export interface MbMatchResult {
  /** MusicBrainz Release Group MBID */
  mbid: string
  /** 匹配分数 (0-100) */
  score: number
  /** 评分 (0-5) */
  rating: number | null
  /** 评分人数 */
  ratingCount: number
  /** 风格标签（来自 MusicBrainz 官方 genres 分类） */
  genres: string[]
  /** 首次发行日期（来自 MusicBrainz first-release-date，格式如 "YYYY-MM-DD"、"YYYY-MM"、"YYYY"） */
  releaseDate: string | null
}

/**
 * 补全进度信息
 */
export interface EnrichProgress {
  /** 当前正在处理的序号 (1-based) */
  current: number
  /** 待补全的总数 */
  total: number
  /** 当前正在处理的专辑标题 */
  albumTitle: string
  /** 当前专辑是否匹配成功 */
  matched: boolean
}

/**
 * 从日期字符串中提取年份（支持 "YYYY-MM-DD"、"YYYY-MM"、"YYYY" 格式）
 */
function extractYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const match = dateStr.match(/^(\d{4})/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * 从多个同 score 的搜索结果中，选出最佳匹配。
 *
 * 优先级：
 *   1. primary-type 为 Album 的优先于 Single/EP 等
 *   2. 发行年份与本地 release_date 一致的优先
 *   3. 同等条件下取最早发行的（原版优于再版）
 */
function pickBestReleaseGroup(
  candidates: IReleaseGroupMatch[],
  releaseDate: string | null
): IReleaseGroupMatch {
  if (candidates.length === 1) return candidates[0]

  const localYear = extractYear(releaseDate)

  // 为每个候选项计算排序权重（越小越好）
  const scored = candidates.map((rg) => {
    let priority = 0

    // 权重 1: 类型 — Album 最优(0)，其他类型(10)
    const rgType = (rg as unknown as Record<string, unknown>)['primary-type']
    if (rgType !== 'Album') {
      priority += 10
    }

    // 权重 2: 年份匹配 — 匹配(0)，不匹配或无法比较(5)
    const mbYear = extractYear(
      (rg as unknown as Record<string, string>)['first-release-date']
    )
    if (localYear && mbYear && localYear === mbYear) {
      // 年份匹配，加分
      priority += 0
    } else if (localYear && mbYear) {
      // 年份不匹配
      priority += 5
    } else {
      // 无法比较（缺少日期信息）
      priority += 3
    }

    // 权重 3: 发行时间 — 越早越好（原版优先）
    // 用年份作为粗粒度排序依据
    const sortYear = mbYear ?? 9999

    return { rg, priority, sortYear }
  })

  // 排序：priority 升序 → sortYear 升序
  scored.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.sortYear - b.sortYear
  })

  return scored[0].rg
}

/**
 * EnrichService - 数据补全服务
 *
 * 通过 MusicBrainz API 匹配并补全专辑的评分和风格标签。
 */
export class EnrichService {
  private albumService: AlbumService
  private isEnriching = false

  constructor(albumService: AlbumService) {
    this.albumService = albumService
  }

  /**
   * 专辑匹配逻辑：按专辑名 + 艺术家名搜索 Release Group，
   * 在同 score 的候选中综合考虑类型、发行年份等信息选出最佳匹配。
   *
   * @param title 专辑名
   * @param artist 艺术家名
   * @param releaseDate 本地已知的发行日期（可选，用于辅助筛选）
   */
  async matchAlbum(
    title: string,
    artist: string,
    releaseDate?: string | null
  ): Promise<MbMatchResult | null> {
    const mbApi = getMbClient()

    try {
      // 搜索 Release Group
      const searchResult = await mbApi.search('release-group', {
        query: { releasegroup: title, artist: artist },
        limit: 10
      })

      const releaseGroups = searchResult['release-groups']
      if (!releaseGroups || releaseGroups.length === 0) {
        return null
      }

      // 筛选出 score >= 50 的候选项
      const viable = (releaseGroups as IReleaseGroupMatch[]).filter(
        (rg) => rg.score >= 50
      )
      if (viable.length === 0) {
        return null
      }

      // 取最高 score
      const topScore = viable[0].score

      // 同 score 的候选（MusicBrainz 搜索结果按 score 降序）
      const topCandidates = viable.filter((rg) => rg.score === topScore)

      // 从同 score 候选中选出最佳匹配
      const bestMatch = pickBestReleaseGroup(topCandidates, releaseDate ?? null)

      // 获取匹配 Release Group 的详细信息（ratings 和 genres）
      const details = await mbApi.lookup('release-group', bestMatch.id, ['ratings', 'genres'])

      const rating = (details as unknown as { rating?: IRating }).rating
      const genres = (details as unknown as { genres?: IMbGenre[] }).genres

      // 提取首次发行日期
      const firstReleaseDate =
        (bestMatch as unknown as Record<string, string>)['first-release-date'] || null

      return {
        mbid: bestMatch.id,
        score: bestMatch.score,
        rating: rating?.value ?? null,
        ratingCount: rating?.['votes-count'] ?? 0,
        genres: genres?.map((g) => g.name).filter(Boolean) ?? [],
        releaseDate: firstReleaseDate
      }
    } catch (error) {
      console.error(`MusicBrainz 匹配失败 [${title} - ${artist}]:`, error)
      return null
    }
  }

  /**
   * 数据补全逻辑：将匹配结果写入数据库
   */
  async enrichAlbum(album: Album): Promise<boolean> {
    const result = await this.matchAlbum(album.title, album.artist, album.release_date)

    if (!result) {
      // 匹配失败，仍然标记为已尝试补全（设置 enriched_at）
      // 避免重复尝试
      this.albumService.updateAlbum(album.id, {
        enriched_at: new Date().toISOString()
      })
      return false
    }

    // 更新 Album 表（包括发行日期：优先使用 MusicBrainz 的数据）
    this.albumService.updateAlbum(album.id, {
      musicbrainz_id: result.mbid,
      mb_rating: result.rating,
      mb_rating_count: result.ratingCount,
      release_date: result.releaseDate ?? album.release_date,
      enriched_at: new Date().toISOString()
    })

    // 更新 Genre 关联
    if (result.genres.length > 0) {
      this.albumService.setAlbumGenres(album.id, result.genres)
    }

    return true
  }

  /**
   * 批量补全流程：对所有未补全的专辑逐个发起匹配
   *
   * @param onProgress 进度回调函数，每处理完一个专辑调用一次
   * @returns 补全结果统计
   */
  async enrichAll(
    onProgress?: (progress: EnrichProgress) => void
  ): Promise<{ matched: number; failed: number; total: number }> {
    if (this.isEnriching) {
      throw new Error('数据补全正在进行中，请勿重复触发。')
    }

    this.isEnriching = true

    try {
      const unenrichedAlbums = this.albumService.getUnenrichedAlbums()
      const total = unenrichedAlbums.length

      if (total === 0) {
        return { matched: 0, failed: 0, total: 0 }
      }

      let matched = 0
      let failed = 0

      for (let i = 0; i < unenrichedAlbums.length; i++) {
        const album = unenrichedAlbums[i]
        const success = await this.enrichAlbum(album)

        if (success) {
          matched++
        } else {
          failed++
        }

        // 进度回调
        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            albumTitle: album.title,
            matched: success
          })
        }
      }

      return { matched, failed, total }
    } finally {
      this.isEnriching = false
    }
  }

  /**
   * 重新补全所有专辑：先重置所有补全状态，再对全部专辑逐个重新匹配。
   *
   * @param onProgress 进度回调函数，每处理完一个专辑调用一次
   * @returns 补全结果统计
   */
  async reEnrichAll(
    onProgress?: (progress: EnrichProgress) => void
  ): Promise<{ matched: number; failed: number; total: number }> {
    if (this.isEnriching) {
      throw new Error('数据补全正在进行中，请勿重复触发。')
    }

    this.isEnriching = true

    try {
      // 重置所有专辑的补全状态
      this.albumService.resetAllEnrichment()

      const allAlbums = this.albumService.getAllAlbumsForEnrich()
      const total = allAlbums.length

      if (total === 0) {
        return { matched: 0, failed: 0, total: 0 }
      }

      let matched = 0
      let failed = 0

      for (let i = 0; i < allAlbums.length; i++) {
        const album = allAlbums[i]
        const success = await this.enrichAlbum(album)

        if (success) {
          matched++
        } else {
          failed++
        }

        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            albumTitle: album.title,
            matched: success
          })
        }
      }

      return { matched, failed, total }
    } finally {
      this.isEnriching = false
    }
  }

  /**
   * 是否正在补全
   */
  get enriching(): boolean {
    return this.isEnriching
  }
}
