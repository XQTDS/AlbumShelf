/**
 * 地区归一化与展示。
 *
 * MusicBrainz artist 的 `country` 是 ISO 3166-1 alpha-2 代码（如 CN / TW / HK）；
 * `area` 是具体地区名（如 Taiwan / Hong Kong / Taipei）。`country` 通常存在，
 * 缺失时才用 `area` 的 ISO 代码或名称映射兜底。
 *
 * 地区键统一为大写 ISO 3166-1 alpha-2 代码；无法识别时返回 null，**不猜测**。
 */

/** 常见国家/地区名（小写）→ ISO 代码 */
const AREA_NAME_TO_REGION: Record<string, string> = {
  china: 'CN',
  'people\'s republic of china': 'CN',
  taiwan: 'TW',
  'republic of china': 'TW',
  'hong kong': 'HK',
  macao: 'MO',
  macau: 'MO',
  japan: 'JP',
  'south korea': 'KR',
  'republic of korea': 'KR',
  korea: 'KR',
  'north korea': 'KP',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  canada: 'CA',
  australia: 'AU',
  'new zealand': 'NZ',
  singapore: 'SG',
  malaysia: 'MY',
  france: 'FR',
  germany: 'DE',
  italy: 'IT',
  spain: 'ES',
  netherlands: 'NL',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
  finland: 'FI',
  iceland: 'IS',
  ireland: 'IE',
  russia: 'RU',
  poland: 'PL',
  'czech republic': 'CZ',
  czechia: 'CZ',
  austria: 'AT',
  switzerland: 'CH',
  belgium: 'BE',
  portugal: 'PT',
  greece: 'GR',
  turkey: 'TR',
  israel: 'IL',
  'south africa': 'ZA',
  brazil: 'BR',
  mexico: 'MX',
  argentina: 'AR',
  india: 'IN',
  thailand: 'TH',
  vietnam: 'VN',
  indonesia: 'ID',
  philippines: 'PH'
}

/** 常见城市/行政区（小写）→ 国家/地区代码；仅在 country 与 area ISO 均缺失时使用 */
const CITY_TO_REGION: Record<string, string> = {
  // 台湾
  taipei: 'TW',
  kaohsiung: 'TW',
  taichung: 'TW',
  tainan: 'TW',
  hsinchu: 'TW',
  taoyuan: 'TW',
  // 香港 / 澳门
  'hong kong': 'HK',
  kowloon: 'HK',
  macau: 'MO',
  macao: 'MO',
  // 大陆
  beijing: 'CN',
  shanghai: 'CN',
  guangzhou: 'CN',
  shenzhen: 'CN',
  chengdu: 'CN',
  wuhan: 'CN',
  nanjing: 'CN',
  hangzhou: 'CN',
  "xi'an": 'CN',
  xian: 'CN',
  tianjin: 'CN',
  chongqing: 'CN',
  shijiazhuang: 'CN',
  // 日本
  tokyo: 'JP',
  osaka: 'JP',
  kyoto: 'JP',
  nagoya: 'JP',
  fukuoka: 'JP',
  sapporo: 'JP',
  kobe: 'JP',
  yokohama: 'JP',
  // 韩国
  seoul: 'KR',
  busan: 'KR',
  incheon: 'KR',
  daegu: 'KR',
  gwangju: 'KR',
  // 英国
  london: 'GB',
  manchester: 'GB',
  liverpool: 'GB',
  glasgow: 'GB',
  edinburgh: 'GB',
  bristol: 'GB',
  birmingham: 'GB',
  // 美国
  'new york': 'US',
  'los angeles': 'US',
  chicago: 'US',
  'san francisco': 'US',
  seattle: 'US',
  boston: 'US',
  detroit: 'US',
  nashville: 'US',
  austin: 'US',
  portland: 'US'
}

/** 中文展示名覆盖：港澳台与大陆使用明确口径，其余交给 Intl.DisplayNames */
const REGION_LABEL_OVERRIDES: Record<string, string> = {
  CN: '中国大陆',
  TW: '中国台湾',
  HK: '中国香港',
  MO: '中国澳门'
}

let displayNames: Intl.DisplayNames | null | undefined

function getDisplayNames(): Intl.DisplayNames | null {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' })
    } catch {
      displayNames = null
    }
  }
  return displayNames
}

function normalizeIsoCode(code: string | null | undefined): string | null {
  if (typeof code !== 'string') return null
  const trimmed = code.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null
}

/**
 * 把 MusicBrainz 的 country / area 归一化为地区键。
 *
 * 优先级：country → area 的 ISO 3166-1 代码 → area 名称/城市映射。
 * 全部无法识别时返回 null，调用方应保持地区为空而不是猜测。
 */
export function normalizeRegion(
  country: string | null | undefined,
  areaName?: string | null,
  isoCodes?: string[] | null
): string | null {
  const fromCountry = normalizeIsoCode(country)
  if (fromCountry) return fromCountry

  if (Array.isArray(isoCodes)) {
    for (const code of isoCodes) {
      const normalized = normalizeIsoCode(code)
      if (normalized) return normalized
    }
  }

  const area = typeof areaName === 'string' ? areaName.trim().toLowerCase() : ''
  if (!area) return null

  return AREA_NAME_TO_REGION[area] ?? CITY_TO_REGION[area] ?? null
}

/**
 * 地区键 → 中文展示名。
 *
 * 港澳台与大陆使用明确口径；其他 ISO 代码用 `Intl.DisplayNames('zh-CN')`
 * 生成中文名，失败时回退原始代码。null 返回 null（调用方显示占位符）。
 */
export function regionLabel(region: string | null | undefined): string | null {
  if (!region) return null

  const key = region.trim().toUpperCase()
  if (!key) return null

  const override = REGION_LABEL_OVERRIDES[key]
  if (override) return override

  try {
    return getDisplayNames()?.of(key) ?? key
  } catch {
    return key
  }
}

/** 合成/合辑类艺人名，不应承载具体地区 */
const SYNTHETIC_ARTIST_NAMES = new Set([
  '群星',
  '群星合辑',
  '合辑',
  '精选',
  'variousartists',
  'various',
  'variousartist'
])

function normalizeArtistName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s·・.,，、&＆/\\\-–—_()（）\[\]【】'’`]/g, '')
}

function cjkChars(name: string): string[] {
  return [...name].filter((ch) => /[一-鿿]/.test(ch))
}

/**
 * 判断 MusicBrainz 艺人是否与网易云主艺人是同一实体。
 *
 * 地区按网易云艺人 ID 共享，因此只有能确认「MB credit 与网易云主艺人同名」
 * 时才写入地区；无法确认时留空，避免把作曲家/合辑/同名不同人的地区挂错。
 *
 * 匹配规则（按顺序）：
 * 1. 合成/合辑名（群星、Various Artists 等）直接排除；
 * 2. 归一化后完全相同；
 * 3. 含拉丁的中英混排名存在包含关系（如「椅子樂團 The Chairs」vs「椅子樂團」）；
 * 4. 双方都是**同长度** CJK 名（≥3 字）且字符重合率 ≥ 60%——覆盖简繁体差异。
 *    长度不同一律不猜，避免「王菲」命中「王菲菲」。
 */
export function isLikelySameArtist(
  neteaseName: string | null | undefined,
  mbNames: (string | null | undefined)[]
): boolean {
  const netease = normalizeArtistName(neteaseName ?? '')
  if (!netease || SYNTHETIC_ARTIST_NAMES.has(netease)) return false

  for (const raw of mbNames) {
    const mb = normalizeArtistName(raw ?? '')
    if (!mb || SYNTHETIC_ARTIST_NAMES.has(mb)) continue

    if (netease === mb) return true

    const shorter = netease.length <= mb.length ? netease : mb
    const longer = netease.length <= mb.length ? mb : netease
    // 包含关系只用于「中英混排」名（如「椅子樂團 The Chairs」vs「椅子樂團」）；
    // 纯 CJK 或纯拉丁名只认完全相同，避免「李健」命中「李健宏」这类误判。
    const hasCjk = /[一-鿿]/.test(netease) || /[一-鿿]/.test(mb)
    const hasLatin = /[a-z]/i.test(longer)
    if (hasCjk && hasLatin && shorter.length >= 2 && longer.includes(shorter)) return true

    const aCjk = cjkChars(netease)
    const bCjk = cjkChars(mb)
    // 简繁差异只做同长度比较；长度不同一律不猜（王菲 vs 王菲菲）。
    if (aCjk.length === bCjk.length && aCjk.length >= 3) {
      const bSet = new Set(bCjk)
      const overlap = aCjk.filter((ch) => bSet.has(ch)).length
      if (overlap / aCjk.length >= 0.6) return true
    }
  }

  return false
}
