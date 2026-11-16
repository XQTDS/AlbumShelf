import { getMbClient } from './mb-client'
import { AlbumService, Album } from '../album-service'
import { ArtistService } from '../artist-service'
import { albumArtistRefs } from '../album-artist'
import { isLikelySameArtist } from '../region'
import type { IReleaseGroupMatch, IRating, IArtist } from 'musicbrainz-api'
import { getAliases, addAlias } from './artist-alias'
import { getEnrichStrategies, type EnrichStrategies } from './settings'
import { extractExternalLinks, type ExternalLinks, type MbUrlRelation } from './external-links'

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
  /** 外部站点链接（RYM / Discogs / AllMusic / Last.fm / Wikipedia），来自 MB url-rels */
  externalLinks: ExternalLinks
  /** 首次发行日期（来自 MusicBrainz first-release-date，格式如 "YYYY-MM-DD"、"YYYY-MM"、"YYYY"） */
  releaseDate: string | null
  /** 主艺人地区信息；null = 无 artist-credit 或解析失败（见 artistResolveFailed） */
  artist: MbArtistRegion | null
  /**
   * true = 艺人地区解析过程中发生网络/API 错误。
   * 此时专辑的 region_checked_at 不应保留旧值，留待后续重新补全/重新同步重试。
   */
  artistResolveFailed: boolean
}

/**
 * 主艺人地区信息（来自 release-group 的 artist-credit[0]，
 * country 缺失时补一次 artist lookup）。
 */
export interface MbArtistRegion {
  /** MusicBrainz Artist MBID */
  mbid: string
  /** MB 艺人规范名 */
  name: string
  sortName: string | null
  /** MB country（ISO 3166-1 alpha-2） */
  country: string | null
  /** MB area 名称 */
  area: string | null
  /** area 的 ISO 3166-1 代码，country 缺失时用于兜底 */
  isoCodes: string[] | null
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
 * 模糊匹配回调类型：由调用方实现，将待确认请求入队。
 *
 * 不阻塞批量补全流程：调用方把（专辑, 候选列表）放入弹窗队列后立即返回，
 * 用户回复后由调用方异步调用 {@link EnrichService.confirmFuzzyMatch} 结算。
 *
 * @param album 当前专辑
 * @param candidates 候选列表（可能为空，用户可手动粘贴 MusicBrainz 链接）
 */
export type OnFuzzyMatchCallback = (
  album: Album,
  candidates: MbFuzzyCandidate[]
) => void

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
  /** 等待用户在弹窗中确认的模糊匹配数 */
  pending: number
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
  private artistService: ArtistService
  private isEnriching = false
  /** 正在查询外部链接的专辑 id，用于并发去重 */
  private externalLinksInFlight = new Set<number>()
  /** 主艺人地区内存缓存：同一 MBID 在一次会话内至多解析一次 */
  private artistRegionCache = new Map<string, MbArtistRegion>()

  constructor(albumService: AlbumService) {
    this.albumService = albumService
    this.artistService = new ArtistService()
  }

  /**
   * 解析 release-group 主艺人的地区信息。
   *
   * - `artist-credit[0].artist` 通常已带 `country`（release-group lookup 加
   *   `inc=artist-credits` 即可），这时零额外请求。
   * - `country` 缺失时：先查本地 artist 表；未命中再 `lookup('artist')` 取
   *   `country / area / begin-area`。结果按 MBID 缓存在内存中。
   * - 网络/API 错误向上抛出，由调用方清空水位线以便回填重试；
   *   MB 确实没有地区数据不算错误，返回 `country/region` 为空的条目。
   */
  private async resolveArtistRegion(credit: IArtist): Promise<MbArtistRegion> {
    const mbid = credit.id
    const cached = this.artistRegionCache.get(mbid)
    if (cached) return cached

    let country = credit.country ?? null
    let areaName = credit.area?.name ?? null
    let isoCodes = credit.area?.['iso-3166-1-codes'] ?? null

    if (!country) {
      // 先看本地是否已有该艺人的地区结果（同一艺人的另一张专辑可能已经查过）
      const local = this.artistService.getArtistByMbid(mbid)
      if (local && local.region_fetched_at) {
        const resolved: MbArtistRegion = {
          mbid,
          name: credit.name || local.name,
          sortName: credit['sort-name'] ?? local.sort_name ?? null,
          country: local.country,
          area: local.area,
          isoCodes: null
        }
        this.artistRegionCache.set(mbid, resolved)
        return resolved
      }

      const mbApi = getMbClient()
      const artist = await mbApi.lookup('artist', mbid)
      country = artist.country ?? null
      areaName = artist.area?.name ?? null
      isoCodes = artist.area?.['iso-3166-1-codes'] ?? null
    }

    const resolved: MbArtistRegion = {
      mbid,
      name: credit.name,
      sortName: credit['sort-name'] ?? null,
      country,
      area: areaName,
      isoCodes
    }
    this.artistRegionCache.set(mbid, resolved)
    return resolved
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

      // 获取匹配 Release Group 的详细信息（ratings、genres、主艺人信用于地区解析、
      // 以及外部站点链接）。artist-credits 搭在同一次 lookup 上，不产生额外请求。
      const details = await mbApi.lookup('release-group', bestMatch.id, [
        'ratings',
        'genres',
        'artist-credits',
        'url-rels'
      ])

      const rating = (details as unknown as { rating?: IRating }).rating
      const genres = (details as unknown as { genres?: IMbGenre[] }).genres
      const externalLinks = extractExternalLinks(
        (details as unknown as { relations?: MbUrlRelation[] }).relations
      )

      // 主艺人地区：country 缺失时才补一次 artist lookup；失败不影响专辑匹配本身，
      // 只标记 artistResolveFailed 让调用方清空区域水位线以便回填重试。
      let artistRegion: MbArtistRegion | null = null
      let artistResolveFailed = false
      const primaryArtist = (
        details as unknown as { 'artist-credit'?: { artist?: IArtist }[] }
      )['artist-credit']?.[0]?.artist
      if (primaryArtist?.id) {
        try {
          artistRegion = await this.resolveArtistRegion(primaryArtist)
        } catch (error) {
          artistResolveFailed = true
          console.error(`艺人地区解析失败 [${title} - ${artist}]:`, error)
        }
      }

      // 提取首次发行日期
      const firstReleaseDate =
        (bestMatch as unknown as Record<string, string>)['first-release-date'] || null

      return {
        mbid: bestMatch.id,
        score: bestMatch.score,
        rating: rating?.value ?? null,
        ratingCount: rating?.['votes-count'] ?? 0,
        genres: genres?.map((g) => g.name).filter(Boolean) ?? [],
        externalLinks,
        releaseDate: firstReleaseDate,
        artist: artistRegion,
        artistResolveFailed
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
   * 把主艺人地区写入 artist 表，并返回应合并进 album update 的地区字段。
   *
   * - `resolveFailed`：网络/API 失败 → 清空 `region_checked_at`（保留旧地区
   *   供界面暂时展示），标记本次未解析成功；后续重新补全/重新同步可再次尝试。
   * - 专辑有网易云主艺人 ID：按该 ID upsert artist（业务键），并写
   *   `album.primary_artist_id`；`artist === null`（无 artist-credit）时只写键与
   *   水位线，地区由已有 artist 行的数据 JOIN 得到。
   * - 专辑没有结构化网易云主艺人 ID：无法建立业务键关联，只写水位线。
   */
  private buildRegionUpdate(
    album: Album,
    artist: MbArtistRegion | null,
    resolveFailed: boolean
  ): {
    primary_artist_id?: number | null
    /** 旧 MBID 列：仅用于启动迁移合并/旧备份兼容，查询与展示不读 */
    primary_artist_mbid?: string | null
    region_checked_at?: string | null
  } {
    if (resolveFailed) {
      // updateAlbum 只跳过 undefined，null 会真正落库
      return { region_checked_at: null }
    }

    const primary = albumArtistRefs(album)[0]
    if (primary?.originalId == null) {
      // 无网易云主艺人 ID：地区无法按业务键关联，但本次尝试仍然算已处理
      return { region_checked_at: new Date().toISOString() }
    }

    if (!artist) {
      return {
        primary_artist_id: primary.originalId,
        region_checked_at: new Date().toISOString()
      }
    }

    // 地区按网易云艺人 ID 共享：只有能确认 MB credit 与网易云主艺人是同一实体时才写入，
    // 否则会把作曲家/合辑/同名不同人的地区挂到该网易云艺人名下的所有专辑。
    // 别名文件是「网易云名 → MB 名」，所以别名要作为网易云侧补充名参与比较；
    // 同时查询主艺人名与专辑展示名的别名，覆盖以 "A / B" 为 key 的历史别名。
    const neteaseNames = new Set(
      [
        primary.name,
        ...getAliases(primary.name),
        ...getAliases(album.artist)
      ].filter(Boolean)
    )
    const matched = [...neteaseNames].some((name) =>
      isLikelySameArtist(name, [artist.name, artist.sortName])
    )
    if (!matched) {
      console.warn(
        `[Enrich] MB 主艺人与网易云主艺人不匹配，跳过地区写入: ` +
          `${primary.name} <-> ${artist.name}`
      )
      return {
        primary_artist_id: primary.originalId,
        region_checked_at: new Date().toISOString()
      }
    }

    this.artistService.upsertArtist({
      neteaseArtistId: primary.originalId,
      neteaseEncryptedId: primary.id,
      name: primary.name,
      musicbrainzArtistId: artist.mbid,
      sortName: artist.sortName,
      country: artist.country,
      area: artist.area,
      isoCodes: artist.isoCodes
    })

    return {
      primary_artist_id: primary.originalId,
      // 旧 MBID 列仅供启动迁移合并 split 行/兼容旧备份使用，查询与展示不读它。
      // 此处写入的 MBID 在 artist 表中必然存在（上面 upsertArtist 已保证），外键安全。
      primary_artist_mbid: artist.mbid,
      region_checked_at: new Date().toISOString()
    }
  }

  /**
   * 数据补全逻辑：将匹配结果写入数据库
   *
   * @param album 待补全的专辑
   * @param onFuzzyMatch 模糊匹配回调，用于将待确认请求入队（可选，无则模糊匹配视为失败）
   * @returns 'matched' 匹配成功（精确匹配），'failed' 完全失败，
   *          'pending' 已入队等待用户确认（结果由 confirmFuzzyMatch 异步结算）
   */
  async enrichAlbum(
    album: Album,
    onFuzzyMatch?: OnFuzzyMatchCallback
  ): Promise<'matched' | 'failed' | 'pending'> {
    const result = await this.matchAlbum(album.title, album.artist, album.release_date)

    if (result) {
      // 精确匹配成功，直接写入（地区字段由 buildRegionUpdate 决定是否写入）
      this.albumService.updateAlbum(album.id, {
        musicbrainz_id: result.mbid,
        mb_rating: result.rating,
        mb_rating_count: result.ratingCount,
        release_date: result.releaseDate ?? album.release_date,
        enriched_at: new Date().toISOString(),
        ...this.buildRegionUpdate(album, result.artist, result.artistResolveFailed)
      })

      if (result.genres.length > 0) {
        this.albumService.fillAlbumGenresIfEmpty(album.id, result.genres)
      }

      // 外部链接：查到了就写，没查到也写空对象 —— '{}' 表示「已查询过」，
      // 避免详情面板对「确实没有链接」的专辑反复发起惰性查询。
      // 这里是顺带写入，不产生额外 MB 请求（url-rels 搭在上面那次 lookup 上）。
      this.albumService.setAlbumExternalLinks(album.id, result.externalLinks)

      return 'matched'
    }

    // 精确匹配失败，尝试模糊查询
    const fuzzyCandidates = await this.fuzzyMatchAlbum(
      album.title,
      album.artist,
      album.release_date
    )

    if (onFuzzyMatch) {
      // 入队弹窗请求，不阻塞批量流程；用户回复后由 confirmFuzzyMatch 异步结算
      // （即使候选为空也入队，用户可手动粘贴 MusicBrainz 链接）
      onFuzzyMatch(album, fuzzyCandidates)
      return 'pending'
    }

    // 完全失败，标记 enriched_at 避免重复尝试
    this.albumService.updateAlbum(album.id, {
      enriched_at: new Date().toISOString()
    })
    return 'failed'
  }

  /**
   * 结算队列中待确认的模糊匹配（由 IPC 弹窗消费器在用户回复后调用）。
   *
   * - 确认：lookup 详情、写入数据库、自动学习别名
   * - 跳过或处理失败：标记 enriched_at 避免重复尝试
   *
   * @param album 待确认的专辑
   * @param candidates 弹窗展示过的候选列表
   * @param reply 用户回复：选中的 mbid，或 null 表示跳过
   */
  async confirmFuzzyMatch(
    album: Album,
    candidates: MbFuzzyCandidate[],
    reply: { mbid: string } | null
  ): Promise<void> {
    if (reply) {
      const confirmed = await this.processConfirmedMatch(album, reply.mbid, candidates)
      if (confirmed) return
    }
    this.albumService.updateAlbum(album.id, {
      enriched_at: new Date().toISOString()
    })
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
      const details = await mbApi.lookup('release-group', mbid, [
        'ratings',
        'genres',
        'artist-credits',
        'url-rels'
      ])
      const rating = (details as unknown as { rating?: IRating }).rating
      const genres = (details as unknown as { genres?: IMbGenre[] }).genres
      const externalLinks = extractExternalLinks(
        (details as unknown as { relations?: MbUrlRelation[] }).relations
      )

      // 从候选中找到选中项，以获取 releaseDate
      const selectedCandidate = candidates.find((c) => c.mbid === mbid)

      // 主艺人地区：lookup 已带 artist-credits，通常零额外请求
      let artistRegion: MbArtistRegion | null = null
      let artistResolveFailed = false
      const primaryArtist = (
        details as unknown as { 'artist-credit'?: { artist?: IArtist }[] }
      )['artist-credit']?.[0]?.artist
      if (primaryArtist?.id) {
        try {
          artistRegion = await this.resolveArtistRegion(primaryArtist)
        } catch (error) {
          artistResolveFailed = true
          console.error(`艺人地区解析失败 [albumId=${album.id}, mbid=${mbid}]:`, error)
        }
      }

      // 写入数据库
      this.albumService.updateAlbum(album.id, {
        musicbrainz_id: mbid,
        mb_rating: rating?.value ?? null,
        mb_rating_count: rating?.['votes-count'] ?? 0,
        release_date: selectedCandidate?.releaseDate ?? undefined,
        enriched_at: new Date().toISOString(),
        ...this.buildRegionUpdate(album, artistRegion, artistResolveFailed)
      })

      // 更新 Genre 关联（仅当专辑当前无风格时写入，保护手动编辑）
      const genreNames = genres?.map((g) => g.name).filter(Boolean) ?? []
      if (genreNames.length > 0) {
        this.albumService.fillAlbumGenresIfEmpty(album.id, genreNames)
      }

      // 外部链接：同 enrichAlbum，查到与否都写（空对象 = 已查询过）
      this.albumService.setAlbumExternalLinks(album.id, externalLinks)

      // 自动别名学习：比较本地完整艺术家名与 MB 返回的艺术家名
      const localArtist = album.artist.trim()
      let mbArtist: string | undefined

      if (selectedCandidate) {
        mbArtist = selectedCandidate.mbArtist.trim()
      } else {
        // 手动指定 MBID 时，从 lookup 结果中提取艺术家名
        const artistCredits = (details as unknown as { 'artist-credit'?: { name: string }[] })['artist-credit']
        if (artistCredits && artistCredits.length > 0) {
          mbArtist = artistCredits.map((ac) => ac.name).join(', ').trim()
        }
      }

      if (mbArtist && localArtist.toLowerCase() !== mbArtist.toLowerCase()) {
        addAlias(localArtist, mbArtist)
        console.log(`自动学习别名: "${localArtist}" → "${mbArtist}"`)
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
   * @param onFuzzyMatch 模糊匹配回调，用于将待确认请求入队（不阻塞批量流程）
   * @returns 补全结果统计
   */
  async enrichAll(
    onProgress?: (progress: EnrichProgress) => void,
    onFuzzyMatch?: OnFuzzyMatchCallback
  ): Promise<EnrichResult> {
    if (this.busy) {
      throw new Error('补全正在进行中，请勿重复触发。')
    }

    this.isEnriching = true

    try {
      const unenrichedAlbums = this.albumService.getUnenrichedAlbums()
      const total = unenrichedAlbums.length

      if (total === 0) {
        return { matched: 0, failed: 0, pending: 0, total: 0 }
      }

      let matched = 0
      let failed = 0
      let pending = 0

      for (let i = 0; i < unenrichedAlbums.length; i++) {
        const album = unenrichedAlbums[i]
        const status = await this.enrichAlbum(album, onFuzzyMatch)

        if (status === 'matched') {
          matched++
        } else if (status === 'failed') {
          failed++
        } else {
          pending++
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

      return { matched, failed, pending, total }
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
    if (this.busy) {
      throw new Error('补全正在进行中，请勿重复触发。')
    }

    this.isEnriching = true

    try {
      // 重置所有专辑的补全状态
      this.albumService.resetAllEnrichment()

      const allAlbums = this.albumService.getAllAlbumsForEnrich()
      const total = allAlbums.length

      if (total === 0) {
        return { matched: 0, failed: 0, pending: 0, total: 0 }
      }

      let matched = 0
      let failed = 0
      let pending = 0

      for (let i = 0; i < allAlbums.length; i++) {
        const album = allAlbums[i]
        const status = await this.enrichAlbum(album, onFuzzyMatch)

        if (status === 'matched') {
          matched++
        } else if (status === 'failed') {
          failed++
        } else {
          pending++
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

      return { matched, failed, pending, total }
    } finally {
      this.isEnriching = false
    }
  }

  /**
   * 补全所有缺失 MB 数据的专辑：针对没有 musicbrainz_id 的专辑进行匹配补全。
   *
   * @param onProgress 进度回调函数，每处理完一个专辑调用一次
   * @param onFuzzyMatch 模糊匹配回调，用于将待确认请求入队（不阻塞批量流程）
   * @returns 补全结果统计
   */
  async enrichAlbumsWithoutMbData(
    onProgress?: (progress: EnrichProgress) => void,
    onFuzzyMatch?: OnFuzzyMatchCallback
  ): Promise<EnrichResult> {
    if (this.busy) {
      throw new Error('补全正在进行中，请勿重复触发。')
    }

    this.isEnriching = true

    try {
      const albumsWithoutMb = this.albumService.getAlbumsWithoutMbData()
      const total = albumsWithoutMb.length

      if (total === 0) {
        return { matched: 0, failed: 0, pending: 0, total: 0 }
      }

      let matched = 0
      let failed = 0
      let pending = 0

      for (let i = 0; i < albumsWithoutMb.length; i++) {
        const album = albumsWithoutMb[i]
        const status = await this.enrichAlbum(album, onFuzzyMatch)

        if (status === 'matched') {
          matched++
        } else if (status === 'failed') {
          failed++
        } else {
          pending++
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

      return { matched, failed, pending, total }
    } finally {
      this.isEnriching = false
    }
  }

  /**
   * 惰性补全专辑的外部站点链接（详情面板打开时调用）。
   *
   * 与曲目数据的惰性补全同款思路：不提供批量回填入口 —— 本机库 2564 张专辑按
   * MB 的 1 req/s 全量回填约需 43 分钟，且实测持续请求下 MB 频繁返回 503。
   * 改为「用户看哪张补哪张」，每张专辑一生只查一次。
   *
   * 注：抽到的 `rym` 键当前无消费方 —— 详情面板的 RYM 入口恒用搜索页（实测 MB
   * 存的 release 直链点不开）。保留采集是因为它与其余字段共用同一次 lookup。
   *
   * @returns 站点 → URL；无须查询或查询失败时返回 null
   */
  async ensureExternalLinks(albumId: number): Promise<ExternalLinks | null> {
    const album = this.albumService.getAlbumById(albumId)
    if (!album) return null

    // 已回填过（含 '{}'：查过但确无链接）→ 直接返回，不再查询
    if (album.external_links != null) {
      return this.albumService.getAlbumExternalLinks(albumId)
    }

    // 无 MBID 则无从查起。此时**不写库**：该专辑后续补全拿到 MBID 后还应再试
    if (!album.musicbrainz_id) return null

    // 同一专辑的并发查询去重（用户快速连点会重复触发）
    if (this.externalLinksInFlight.has(albumId)) return null
    this.externalLinksInFlight.add(albumId)

    try {
      const mbApi = getMbClient()
      const details = await mbApi.lookup('release-group', album.musicbrainz_id, ['url-rels'])
      const links = extractExternalLinks(
        (details as unknown as { relations?: MbUrlRelation[] }).relations
      )

      this.albumService.setAlbumExternalLinks(albumId, links)
      return links
    } catch (error) {
      // 失败保持 NULL，下次打开面板自然重试。
      // 不写 '{}' —— 否则一次网络抖动会把该专辑永久钉死成「无链接」。
      console.error(`外部链接查询失败 [albumId=${albumId}]:`, error)
      return null
    } finally {
      this.externalLinksInFlight.delete(albumId)
    }
  }

  /**
   * 是否正在补全
   */
  get enriching(): boolean {
    return this.isEnriching
  }

  /** 是否有批量 MB 补全任务在运行 */
  get busy(): boolean {
    return this.isEnriching
  }
}
