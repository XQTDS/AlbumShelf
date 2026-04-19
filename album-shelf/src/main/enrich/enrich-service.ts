import { getMbClient } from './mb-client'
import { AlbumService, Album } from '../album-service'
import type { IReleaseGroupMatch, IRating } from 'musicbrainz-api'
import { getAliases, addAlias } from './artist-alias'
import { getEnrichStrategies, type EnrichStrategies } from './settings'

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
 * 模糊匹配候选（仅含搜索信息，不含 rating/genres，推迟到用户确认后获取）
 */
export interface MbFuzzyCandidate {
  /** MusicBrainz Release Group MBID */
  mbid: string
  /** MB 上的标题 */
  mbTitle: string
  /** MB 上的艺术家信用 */
  mbArtist: string
  /** 匹配分数 (0-100) */
  score: number
  /** 首次发行日期 */
  releaseDate: string | null
}

/**
 * 模糊匹配回调类型：由调用方实现，用于逐条确认
 *
 * @param album 当前专辑
 * @param candidates 候选列表
 * @returns 用户选择的候选 mbid，或 null 表示拒绝
 */
export type OnFuzzyMatchCallback = (
  album: Album,
  candidates: MbFuzzyCandidate[]
) => Promise<{ mbid: string } | null>

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
 * 补全结果统计
 */
export interface EnrichResult {
  /** 精确匹配成功数 */
  matched: number
  /** 完全失败数 */
  failed: number
  /** 用户确认的模糊匹配数 */
  confirmed: number
  /** 总数 */
  total: number
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
      // 构建搜索查询列表，按优先级依次尝试
      const queries = this.buildSearchQueries(title, artist)

      let releaseGroups: IReleaseGroupMatch[] | null = null

      for (const query of queries) {
        const searchResult = await mbApi.search('release-group', {
          query,
          limit: 10
        })

        const groups = (searchResult['release-groups'] as IReleaseGroupMatch[] | undefined)
        if (groups && groups.length > 0) {
          releaseGroups = groups
          break
        }
      }

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
   * 构建搜索查询列表，按优先级排列。
   *
   * 问题背景：
   *   - MusicBrainz 的 Lucene 搜索对 artist 字段做短语精确匹配，
   *     当 artist 包含多个艺术家（如 "潘越云 齐豫"）时，
   *     artist:"潘越云 齐豫" 会匹配不到（MB 中是两个独立 artist-credit）。
   *   - 中文简繁体差异（如 "回声" vs "回聲"）也会导致标题匹配失败。
   *
   * 策略：
   *   1. 完整标题 + 完整艺术家（原逻辑，适用于大多数情况）
   *   2. 完整标题 + 第一个艺术家（处理多艺术家场景）
   *   3. 标题首词 + 第一个艺术家（处理简繁体/标点差异导致标题匹配失败的场景）
   *
   * @param title 专辑名
   * @param artist 艺术家名（可能包含多个艺术家，空格分隔）
   */
  buildSearchQueries(title: string, artist: string): string[] {
    const queries: string[] = []
    const strategies = getEnrichStrategies()
    const aliases = getAliases(artist)
    const allArtists = [artist, ...aliases]

    // 检测是否为多艺术家（空格分隔且不止一个词）
    const artistParts = artist.split(/\s+/).filter(Boolean)

    // 提取标题首词（以空格或中文标点为分隔）
    // 匹配连续的 CJK 字符或连续的非空格非标点字符
    const titleFirstWordMatch = title.match(/^[\u4e00-\u9fff\u3400-\u4dbf\w]+/)
    const titleFirstWord = titleFirstWordMatch ? titleFirstWordMatch[0] : null

    // Q1: 完整标题 + 完整艺术家（B-2 优先级：同策略内先原名后别名）
    if (strategies.Q1_fullTitleFullArtist) {
      for (const a of allArtists) {
        queries.push(`releasegroup:"${title}" AND artist:"${a}"`)
      }
    }

    // Q2: 完整标题 + 第一个艺术家
    if (strategies.Q2_fullTitleFirstArtist && artistParts.length > 1) {
      // 原名取第一个词
      queries.push(`releasegroup:"${title}" AND artist:"${artistParts[0]}"`)
      // 别名各自作为完整艺术家名使用（别名本身就是单个艺术家名）
      for (const alias of aliases) {
        queries.push(`releasegroup:"${title}" AND artist:"${alias}"`)
      }
    }

    // Q3: 标题首词 + 第一个艺术家
    if (strategies.Q3_titleFirstWordFirstArtist && titleFirstWord && titleFirstWord !== title) {
      queries.push(`releasegroup:"${titleFirstWord}" AND artist:"${artistParts[0]}"`)
      for (const alias of aliases) {
        queries.push(`releasegroup:"${titleFirstWord}" AND artist:"${alias}"`)
      }
    }

    // 去除重复查询
    return [...new Set(queries)]
  }

  /**
   * 构建模糊查询列表，按优先级排列。
   *
   * 仅在精确匹配完全失败时调用。
   *
   * 策略：
   *   F1. 去除标题中的艺术家名前缀后搜索
   *   F2. 去除标题末尾的括号后缀后搜索
   *   F3. Lucene 分词搜索（去掉 releasegroup 字段的引号）
   *
   * @param title 专辑名
   * @param artist 艺术家名
   */
  buildFuzzyQueries(title: string, artist: string): string[] {
    const queries: string[] = []
    const strategies = getEnrichStrategies()
    const aliases = getAliases(artist)
    const artistParts = artist.split(/\s+/).filter(Boolean)
    const primaryArtist = artistParts[0]

    // F1: 去除标题中的艺术家名前缀（B-2 优先级：同策略内先原名后别名）
    if (strategies.F1_removeArtistPrefix) {
      // 匹配 "Tim Berne's Fractured Fairy Tales" → "Fractured Fairy Tales"
      const artistPrefixPattern = new RegExp(
        '^' + escapeRegex(artist) + "[''']?s?[\\s\\-–—:]+",
        'i'
      )
      const titleWithoutArtist = title.replace(artistPrefixPattern, '')
      if (titleWithoutArtist && titleWithoutArtist !== title) {
        // 原名
        queries.push(
          `releasegroup:"${titleWithoutArtist}" AND artist:"${primaryArtist}"`
        )
        // 别名
        for (const alias of aliases) {
          queries.push(
            `releasegroup:"${titleWithoutArtist}" AND artist:"${alias}"`
          )
        }
      }
    }

    // F2: 去除标题末尾的括号后缀
    if (strategies.F2_removeParenSuffix) {
      // 匹配 "OK Computer (Deluxe Edition)" → "OK Computer"
      const titleWithoutParens = title.replace(/\s*[(\uFF08\[].+?[)\uFF09\]]\s*$/, '').trim()
      if (titleWithoutParens && titleWithoutParens !== title) {
        // 原名
        queries.push(
          `releasegroup:"${titleWithoutParens}" AND artist:"${primaryArtist}"`
        )
        // 别名
        for (const alias of aliases) {
          queries.push(
            `releasegroup:"${titleWithoutParens}" AND artist:"${alias}"`
          )
        }
      }
    }

    // F3: Lucene 分词搜索（去掉 releasegroup 引号）
    // 按各词分别匹配而非短语精确匹配，覆盖面更广
    if (strategies.F3_luceneTokenSearch) {
      // 原名
      queries.push(
        `releasegroup:${title} AND artist:"${primaryArtist}"`
      )
      // 别名
      for (const alias of aliases) {
        queries.push(
          `releasegroup:${title} AND artist:"${alias}"`
        )
      }
    }

    // 去除重复查询
    return [...new Set(queries)]
  }

  /**
   * 模糊匹配专辑：在精确匹配失败后调用。
   *
   * 与 matchAlbum 不同，不调用 lookup 获取 rating/genres，
   * 仅返回搜索信息，推迟到用户确认后再获取详细信息。
   *
   * @returns 最多 5 个候选（按 score 降序），或空数组表示无结果
   */
  async fuzzyMatchAlbum(
    title: string,
    artist: string,
    _releaseDate?: string | null
  ): Promise<MbFuzzyCandidate[]> {
    const mbApi = getMbClient()

    try {
      const queries = this.buildFuzzyQueries(title, artist)

      let releaseGroups: IReleaseGroupMatch[] | null = null

      for (const query of queries) {
        const searchResult = await mbApi.search('release-group', {
          query,
          limit: 10
        })

        const groups = searchResult['release-groups'] as IReleaseGroupMatch[] | undefined
        if (groups && groups.length > 0) {
          releaseGroups = groups
          break
        }
      }

      if (!releaseGroups || releaseGroups.length === 0) {
        return []
      }

      // 筛选出 score >= 50 的候选项，取前 5 个
      const viable = releaseGroups.filter((rg) => rg.score >= 50).slice(0, 5)
      if (viable.length === 0) {
        return []
      }

      // 将每个候选转换为 MbFuzzyCandidate
      return viable.map((rg) => {
        const mbTitle = rg.title || title
        const mbArtist =
          (rg as unknown as { 'artist-credit'?: { name: string }[] })[
            'artist-credit'
          ]
            ?.map((ac) => ac.name)
            .join(', ') || artist
        const firstReleaseDate =
          (rg as unknown as Record<string, string>)['first-release-date'] || null

        return {
          mbid: rg.id,
          mbTitle,
          mbArtist,
          score: rg.score,
          releaseDate: firstReleaseDate
        }
      })
    } catch (error) {
      console.error(`MusicBrainz 模糊匹配失败 [${title} - ${artist}]:`, error)
      return []
    }
  }

  /**
   * 数据补全逻辑：将匹配结果写入数据库
   *
   * @param album 待补全的专辑
   * @param onFuzzyMatch 模糊匹配回调，用于逐条确认（可选，无则模糊匹配视为失败）
   * @returns 'matched' 匹配成功（含用户确认）, 'failed' 完全失败
   */
  async enrichAlbum(
    album: Album,
    onFuzzyMatch?: OnFuzzyMatchCallback
  ): Promise<'matched' | 'failed'> {
    const result = await this.matchAlbum(album.title, album.artist, album.release_date)

    if (result) {
      // 精确匹配成功，直接写入
      this.albumService.updateAlbum(album.id, {
        musicbrainz_id: result.mbid,
        mb_rating: result.rating,
        mb_rating_count: result.ratingCount,
        release_date: result.releaseDate ?? album.release_date,
        enriched_at: new Date().toISOString()
      })

      if (result.genres.length > 0) {
        this.albumService.setAlbumGenres(album.id, result.genres)
      }

      return 'matched'
    }

    // 精确匹配失败，尝试模糊查询
    const fuzzyCandidates = await this.fuzzyMatchAlbum(
      album.title,
      album.artist,
      album.release_date
    )

    if (fuzzyCandidates.length > 0 && onFuzzyMatch) {
      // 模糊匹配有候选，立即请求用户确认
      const reply = await onFuzzyMatch(album, fuzzyCandidates)

      if (reply) {
        // 用户确认了某个候选
        const confirmed = await this.processConfirmedMatch(album, reply.mbid, fuzzyCandidates)
        return confirmed ? 'matched' : 'failed'
      }
    }

    // 完全失败或用户拒绝，标记 enriched_at 避免重复尝试
    this.albumService.updateAlbum(album.id, {
      enriched_at: new Date().toISOString()
    })
    return 'failed'
  }

  /**
   * 处理用户确认的模糊匹配：获取详细信息、写入数据库、自动学习别名
   */
  private async processConfirmedMatch(
    album: Album,
    mbid: string,
    candidates: MbFuzzyCandidate[]
  ): Promise<boolean> {
    const mbApi = getMbClient()

    try {
      // 获取详细信息
      const details = await mbApi.lookup('release-group', mbid, ['ratings', 'genres'])
      const rating = (details as unknown as { rating?: IRating }).rating
      const genres = (details as unknown as { genres?: IMbGenre[] }).genres

      // 从候选中找到选中项，以获取 releaseDate
      const selectedCandidate = candidates.find((c) => c.mbid === mbid)

      // 写入数据库
      this.albumService.updateAlbum(album.id, {
        musicbrainz_id: mbid,
        mb_rating: rating?.value ?? null,
        mb_rating_count: rating?.['votes-count'] ?? 0,
        release_date: selectedCandidate?.releaseDate ?? undefined,
        enriched_at: new Date().toISOString()
      })

      // 更新 Genre 关联
      const genreNames = genres?.map((g) => g.name).filter(Boolean) ?? []
      if (genreNames.length > 0) {
        this.albumService.setAlbumGenres(album.id, genreNames)
      }

      // 自动别名学习：比较本地完整艺术家名与 MB 返回的艺术家名
      if (selectedCandidate) {
        const localArtist = album.artist.trim()
        const mbArtist = selectedCandidate.mbArtist.trim()

        if (localArtist.toLowerCase() !== mbArtist.toLowerCase()) {
          addAlias(localArtist, mbArtist)
          console.log(`自动学习别名: "${localArtist}" → "${mbArtist}"`)
        }
      }

      return true
    } catch (error) {
      console.error(`确认模糊匹配失败 [albumId=${album.id}, mbid=${mbid}]:`, error)
      return false
    }
  }

  /**
   * 批量补全流程：对所有未补全的专辑逐个发起匹配
   *
   * @param onProgress 进度回调函数，每处理完一个专辑调用一次
   * @param onFuzzyMatch 模糊匹配回调，用于逐条确认
   * @returns 补全结果统计
   */
  async enrichAll(
    onProgress?: (progress: EnrichProgress) => void,
    onFuzzyMatch?: OnFuzzyMatchCallback
  ): Promise<EnrichResult> {
    if (this.isEnriching) {
      throw new Error('数据补全正在进行中，请勿重复触发。')
    }

    this.isEnriching = true

    try {
      const unenrichedAlbums = this.albumService.getUnenrichedAlbums()
      const total = unenrichedAlbums.length

      if (total === 0) {
        return { matched: 0, failed: 0, confirmed: 0, total: 0 }
      }

      let matched = 0
      let failed = 0
      let confirmed = 0

      // 包装 onFuzzyMatch 回调以计数用户确认次数
      const wrappedOnFuzzyMatch: OnFuzzyMatchCallback | undefined = onFuzzyMatch
        ? async (album, candidates) => {
            const reply = await onFuzzyMatch(album, candidates)
            if (reply) confirmed++
            return reply
          }
        : undefined

      for (let i = 0; i < unenrichedAlbums.length; i++) {
        const album = unenrichedAlbums[i]
        const status = await this.enrichAlbum(album, wrappedOnFuzzyMatch)

        if (status === 'matched') {
          matched++
        } else if (status === 'failed') {
          failed++
        }

        // 进度回调
        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            albumTitle: album.title,
            matched: status === 'matched'
          })
        }
      }

      return { matched, failed, confirmed, total }
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
    onProgress?: (progress: EnrichProgress) => void,
    onFuzzyMatch?: OnFuzzyMatchCallback
  ): Promise<EnrichResult> {
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
        return { matched: 0, failed: 0, confirmed: 0, total: 0 }
      }

      let matched = 0
      let failed = 0
      let confirmed = 0

      const wrappedOnFuzzyMatch: OnFuzzyMatchCallback | undefined = onFuzzyMatch
        ? async (album, candidates) => {
            const reply = await onFuzzyMatch(album, candidates)
            if (reply) confirmed++
            return reply
          }
        : undefined

      for (let i = 0; i < allAlbums.length; i++) {
        const album = allAlbums[i]
        const status = await this.enrichAlbum(album, wrappedOnFuzzyMatch)

        if (status === 'matched') {
          matched++
        } else if (status === 'failed') {
          failed++
        }

        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            albumTitle: album.title,
            matched: status === 'matched'
          })
        }
      }

      return { matched, failed, confirmed, total }
    } finally {
      this.isEnriching = false
    }
  }

  /**
   * 补全所有缺失 MB 数据的专辑：针对没有 musicbrainz_id 的专辑进行匹配补全。
   *
   * @param onProgress 进度回调函数，每处理完一个专辑调用一次
   * @param onFuzzyMatch 模糊匹配回调，用于逐条确认
   * @returns 补全结果统计
   */
  async enrichAlbumsWithoutMbData(
    onProgress?: (progress: EnrichProgress) => void,
    onFuzzyMatch?: OnFuzzyMatchCallback
  ): Promise<EnrichResult> {
    if (this.isEnriching) {
      throw new Error('数据补全正在进行中，请勿重复触发。')
    }

    this.isEnriching = true

    try {
      const albumsWithoutMb = this.albumService.getAlbumsWithoutMbData()
      const total = albumsWithoutMb.length

      if (total === 0) {
        return { matched: 0, failed: 0, confirmed: 0, total: 0 }
      }

      let matched = 0
      let failed = 0
      let confirmed = 0

      const wrappedOnFuzzyMatch: OnFuzzyMatchCallback | undefined = onFuzzyMatch
        ? async (album, candidates) => {
            const reply = await onFuzzyMatch(album, candidates)
            if (reply) confirmed++
            return reply
          }
        : undefined

      for (let i = 0; i < albumsWithoutMb.length; i++) {
        const album = albumsWithoutMb[i]
        const status = await this.enrichAlbum(album, wrappedOnFuzzyMatch)

        if (status === 'matched') {
          matched++
        } else if (status === 'failed') {
          failed++
        }

        // 进度回调
        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            albumTitle: album.title,
            matched: status === 'matched'
          })
        }
      }

      return { matched, failed, confirmed, total }
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
