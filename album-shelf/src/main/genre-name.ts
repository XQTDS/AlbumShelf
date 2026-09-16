/**
 * 风格名归一化（主进程唯一真源）。
 *
 * 风格库同步（`mergeGenreLibrary`）与专辑写入（`setAlbumGenres`）共用同一归一化键
 * 做去重，口径必须一致，否则会像「Impressionism / impressionism」那样产生同名重复行。
 *
 * 必须在 JS 侧实现：SQLite 的 `lower()` 只处理 ASCII（会漏掉 `afoxé`、`čalgija`
 * 一类名称），`trim()` 默认只去空格、不去换行（`choral symphony\n` 正是这样漏网的）。
 */

/** 归一化键：去首尾空白 → 折叠连续空白 → 忽略大小写（用于去重匹配） */
export function normalizeGenreKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** 归一化后的展示名：去首尾空白 → 折叠连续空白（保留原始大小写，用于建档写入） */
export function normalizeGenreName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}
