/**
 * 专辑外部链接抽取
 *
 * 从 MusicBrainz release-group 的 `url-rels` 关系里抽出第三方站点的链接，
 * 供详情面板跳转。目标是让用户能一键到 RYM 等站点自行查阅（RYM 无官方 API
 * 且禁止抓取，只做跳转不做数据采集）。
 */

/** 支持的第三方站点 */
export type ExternalLinkKey =
  | 'rym'
  | 'discogs'
  | 'allmusic'
  | 'lastfm'
  | 'wikipedia'

/** 站点 → URL 映射，仅包含实际取到的站点 */
export type ExternalLinks = Partial<Record<ExternalLinkKey, string>>

/**
 * host 后缀 → 存储键。
 *
 * 用后缀匹配覆盖 `www.` 与各国子域（如 `de.wikipedia.org`）。
 */
const HOST_WHITELIST: ReadonlyArray<readonly [string, ExternalLinkKey]> = [
  ['rateyourmusic.com', 'rym'],
  ['discogs.com', 'discogs'],
  ['allmusic.com', 'allmusic'],
  ['last.fm', 'lastfm'],
  ['wikipedia.org', 'wikipedia']
]

/** MB 关系条目（只取用得到的字段，其余忽略） */
export interface MbUrlRelation {
  type?: string
  url?: { resource?: string }
}

/**
 * 从 MB 的 `relations` 数组抽取白名单站点的链接。
 *
 * 注意：**必须按 URL host 匹配，不能按 `type`**。实测 RYM 链接的 type 是通用的
 * `other databases`，同一 type 下还混着 last.fm、musik-sammler、offiziellecharts
 * 等无关站点，按 type 筛会同时漏掉和误收。
 *
 * @param relations MB lookup 返回的 relations 数组（非 url-rels 的关系会被自然忽略）
 * @returns 站点 → URL；同一站点出现多次时取第一条
 */
export function extractExternalLinks(
  relations: readonly MbUrlRelation[] | undefined | null
): ExternalLinks {
  const links: ExternalLinks = {}
  if (!relations) return links

  for (const relation of relations) {
    const resource = relation?.url?.resource
    if (!resource) continue

    let hostname: string
    try {
      hostname = new URL(resource).hostname.toLowerCase()
    } catch {
      // MB 里存在少量畸形 URL，跳过即可
      continue
    }

    for (const [domain, key] of HOST_WHITELIST) {
      if (links[key]) continue
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        links[key] = resource
        break
      }
    }
  }

  return links
}

/**
 * 构造 RYM 搜索页链接。
 *
 * `searchtype=l` 限定搜索 release。该格式被 MusicBee / Mp3tag / foobar2000 长期
 * 沿用，稳定；且不依赖 slug 规则（RYM 的 slug 用下划线而非连字符、逗号转双下划线
 * 等规则不统一，自己拼直链会静默 404）。
 *
 * 注：即便 `extractExternalLinks()` 取到了 `rym` 直链，详情面板也不用它——实测
 * MB 存的直链点不开（见 `album-detail-expand` spec）。搜索页是唯一可靠的入口。
 */
export function rymSearchUrl(artist: string, title: string): string {
  const query = encodeURIComponent(`${artist} ${title}`.trim())
  return `https://rateyourmusic.com/search?searchterm=${query}&searchtype=l`
}
