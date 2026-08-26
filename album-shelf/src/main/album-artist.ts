/**
 * 专辑艺术家结构化解析（主进程唯一真源）。
 *
 * album.artists 为结构化 JSON [{name, originalId, id}]（NULL = 未回填），
 * album.artist 为其派生展示文本（' / ' 连接，与 artists 同源）。
 * 读取方统一走 albumArtistRefs：结构化优先；未回填行回退文本拆分
 * （读时不写库、不猜数据，回退路径 ID 一律 null）。
 */

export interface AlbumArtistRef {
  name: string
  originalId: number | null
  /** 网易云加密 ID */
  id: string | null
}

/** 艺术家文本拆分（多艺术家以 '/' 分隔；自 followed-artist-service 迁入，语义不变） */
export function splitArtistText(artist: string): string[] {
  return artist.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean)
}

/** 解析 artists JSON；NULL/空串/损坏/空数组/无有效名字 → null（调用方回退文本拆分） */
export function parseAlbumArtistsJson(artists: string | null): AlbumArtistRef[] | null {
  if (!artists) return null
  try {
    const parsed = JSON.parse(artists)
    if (!Array.isArray(parsed)) return null
    const refs = parsed
      .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
      .map((item) => ({
        name: typeof item.name === 'string' ? item.name.trim() : '',
        originalId: typeof item.originalId === 'number' ? item.originalId : null,
        id: typeof item.id === 'string' ? item.id : null
      }))
      .filter((item) => item.name.length > 0)
    return refs.length > 0 ? refs : null
  } catch {
    return null // 损坏 JSON 回退文本拆分
  }
}

/** 专辑艺术家列表：结构化优先，未回填行回退文本拆分（回退路径 ID 一律 null） */
export function albumArtistRefs(row: {
  artist: string
  artists: string | null
}): AlbumArtistRef[] {
  const structured = parseAlbumArtistsJson(row.artists)
  if (structured) return structured
  return splitArtistText(row.artist).map((name) => ({ name, originalId: null, id: null }))
}
