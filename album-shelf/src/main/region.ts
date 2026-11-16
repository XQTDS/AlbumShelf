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
