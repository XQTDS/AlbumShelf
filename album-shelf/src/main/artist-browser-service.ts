import Database from 'better-sqlite3'
import { getDatabase } from './database'
import { albumArtistRefs, type AlbumArtistRef } from './album-artist'
import { isSyntheticArtist, listRegionOptions, regionLabel, type RegionOptionItem } from './region'

// ==================== Types ====================

/** 艺人身份键：netease:<ID> / encrypted:<ID> / name:<归一化名字> */
export type ArtistBrowserKey = string

export interface ArtistBrowserSummary {
  key: ArtistBrowserKey
  netease_artist_id: number | null
  netease_encrypted_id: string | null
  name: string
  /** 同一身份出现过的其他名字（同 ID 多名场景） */
  alias_names: string[]
  region: string | null
  region_label: string | null
  region_area: string | null
  /** NULL = 自动/MB 来源；'manual' = 用户手动设置或清除 */
  region_source: 'manual' | null
  album_count: number
  primary_album_count: number
  /** 至少有一张专辑已评分时才有值 */
  rated_album_count: number
  average_rating: number | null
  /** 群星/Various Artists 等合成实体 */
  is_synthetic: boolean
}

export interface ArtistBrowserAlbum {
  id: number
  title: string
  cover_url: string | null
  user_rating: number | null
  release_date: string | null
  /** 该专辑的 artists[0] 是否就是这位艺人 */
  is_primary: boolean
  /** 专辑完整艺术家展示文本（合作语境） */
  artist_text: string
}

interface AlbumRow {
  id: number
  title: string
  cover_url: string | null
  release_date: string | null
  user_rating: number | null
  artist: string
  artists: string | null
}

interface ArtistRow {
  netease_artist_id: number
  netease_encrypted_id: string | null
  name: string
  region: string | null
  area: string | null
  region_source: string | null
}

interface GroupAlbum {
  album: AlbumRow
  isPrimary: boolean
}

interface ArtistGroup {
  key: ArtistBrowserKey
  neteaseArtistId: number | null
  encryptedId: string | null
  /** 原始展示名 → 出现次数 */
  names: Map<string, number>
  albums: Map<number, GroupAlbum>
  /** artist 行补充字段（只有 netease 身份才可能有） */
  artistName: string | null
  region: string | null
  regionArea: string | null
  regionSource: 'manual' | null
}

// ==================== Helpers ====================

/** 名字归并键：只做 NFKC + trim + 小写；不剥离标点，避免把不同艺人过度合并 */
function nameKey(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase()
}

function identityKey(ref: AlbumArtistRef): ArtistBrowserKey {
  if (ref.originalId != null && ref.originalId > 0) {
    return `netease:${ref.originalId}`
  }
  if (ref.id) {
    return `encrypted:${ref.id}`
  }
  return `name:${nameKey(ref.name)}`
}

function createGroup(key: ArtistBrowserKey, ref: AlbumArtistRef): ArtistGroup {
  let neteaseArtistId: number | null = null
  let encryptedId: string | null = ref.id ?? null

  if (key.startsWith('netease:')) {
    neteaseArtistId = Number(key.slice('netease:'.length))
  } else if (key.startsWith('encrypted:')) {
    encryptedId = key.slice('encrypted:'.length)
  }

  return {
    key,
    neteaseArtistId,
    encryptedId,
    names: new Map(),
    albums: new Map(),
    artistName: null,
    region: null,
    regionArea: null,
    regionSource: null
  }
}

// ==================== ArtistBrowserService ====================

/**
 * 艺人信息窗口的只读聚合服务。
 *
 * 数据真源是 `album.artists`：每次从库内专辑派生艺人目录，`artist` 表只用于
 * 按网易云 ID 补充规范名与地区。这样同步删除专辑后艺人列表自动收敛，
 * 不会出现 0 专辑的 artist 孤儿行；也不依赖 artists 行为主艺人建行的迁移。
 *
 * 当前库约 2600 张专辑 / 2800 条署名引用，单次全表扫描 + JS 聚合是毫秒级；
 * 若未来到万级，可演进为 album_artist 正规化表或统计缓存（见 design.md）。
 */
export class ArtistBrowserService {
  private db: Database.Database

  constructor() {
    this.db = getDatabase()
  }

  listArtists(): ArtistBrowserSummary[] {
    return [...this.buildGroups().values()]
      .map((group) => this.toSummary(group))
      .filter((item) => item.album_count > 0)
      .sort(
        (a, b) =>
          Number(a.is_synthetic) - Number(b.is_synthetic) ||
          b.album_count - a.album_count ||
          a.name.localeCompare(b.name, 'zh-CN') ||
          a.key.localeCompare(b.key)
      )
  }

  getArtist(key: ArtistBrowserKey): ArtistBrowserSummary | null {
    const group = this.buildGroups().get(key)
    return group ? this.toSummary(group) : null
  }

  listAlbums(key: ArtistBrowserKey): ArtistBrowserAlbum[] {
    const group = this.buildGroups().get(key)
    if (!group) return []

    return [...group.albums.values()]
      .map((item) => ({
        id: item.album.id,
        title: item.album.title,
        cover_url: item.album.cover_url,
        user_rating: item.album.user_rating,
        release_date: item.album.release_date,
        is_primary: item.isPrimary,
        artist_text: item.album.artist
      }))
      .sort((a, b) => {
        const dateA = a.release_date ?? ''
        const dateB = b.release_date ?? ''
        if (dateA !== dateB) return dateB.localeCompare(dateA)
        return b.id - a.id
      })
  }

  /** 手动地区选择器候选：标准 ISO 列表 + 库中已有地区 */
  getRegionOptions(): RegionOptionItem[] {
    const rows = this.db
      .prepare('SELECT DISTINCT region FROM artist WHERE region IS NOT NULL')
      .all() as { region: string }[]
    return listRegionOptions(rows.map((row) => row.region))
  }

  private toSummary(group: ArtistGroup): ArtistBrowserSummary {
    const sortedNames = [...group.names.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN')
    )
    const canonicalName = group.artistName?.trim() || sortedNames[0]?.[0] || '未知艺人'
    const aliasNames = sortedNames
      .map(([name]) => name)
      .filter((name) => name !== canonicalName)

    let sum = 0
    let rated = 0
    let primaryCount = 0
    for (const item of group.albums.values()) {
      if (item.isPrimary) primaryCount++
      if (item.album.user_rating != null) {
        sum += item.album.user_rating
        rated++
      }
    }

    return {
      key: group.key,
      netease_artist_id: group.neteaseArtistId,
      netease_encrypted_id: group.encryptedId,
      name: canonicalName,
      alias_names: aliasNames,
      region: group.region,
      region_label: regionLabel(group.region),
      region_area: group.regionArea,
      region_source: group.regionSource,
      album_count: group.albums.size,
      primary_album_count: primaryCount,
      rated_album_count: rated,
      average_rating: rated > 0 ? Math.round((sum / rated) * 10) / 10 : null,
      is_synthetic: isSyntheticArtist(group.neteaseArtistId, canonicalName)
    }
  }

  private buildGroups(): Map<ArtistBrowserKey, ArtistGroup> {
    const artistRows = this.db
      .prepare(`
        SELECT netease_artist_id, netease_encrypted_id, name, region, area, region_source
        FROM artist
        WHERE netease_artist_id IS NOT NULL AND netease_artist_id > 0
      `)
      .all() as ArtistRow[]

    const artistById = new Map<number, ArtistRow>()
    for (const row of artistRows) {
      artistById.set(row.netease_artist_id, row)
    }

    const albums = this.db
      .prepare(`
        SELECT id, title, cover_url, release_date, user_rating, artist, artists
        FROM album
      `)
      .all() as AlbumRow[]

    const groups = new Map<ArtistBrowserKey, ArtistGroup>()

    for (const album of albums) {
      const refs = albumArtistRefs(album)
      if (refs.length === 0) continue

      const primaryKey = identityKey(refs[0])
      const seen = new Set<ArtistBrowserKey>()

      for (const ref of refs) {
        const key = identityKey(ref)
        // 同一专辑内同一身份只计一次（重复 credit / 同一人多名）
        if (seen.has(key)) continue
        seen.add(key)

        let group = groups.get(key)
        if (!group) {
          group = createGroup(key, ref)
          groups.set(key, group)
        }

        const displayName = ref.name.trim()
        if (displayName) {
          group.names.set(displayName, (group.names.get(displayName) ?? 0) + 1)
        }
        if (!group.encryptedId && ref.id) {
          group.encryptedId = ref.id
        }

        const existing = group.albums.get(album.id)
        if (existing) {
          existing.isPrimary = existing.isPrimary || key === primaryKey
        } else {
          group.albums.set(album.id, {
            album,
            isPrimary: key === primaryKey
          })
        }
      }
    }

    // 用 artist 行补充规范名与地区（严格按网易云 ID，不做名字回退）
    for (const group of groups.values()) {
      if (group.neteaseArtistId == null) continue
      const row = artistById.get(group.neteaseArtistId)
      if (!row) continue

      if (row.name) {
        group.artistName = row.name
        // 规范名也纳入名字集合，供无 ID 名字桶的唯一同名合并使用
        if (!group.names.has(row.name)) group.names.set(row.name, 0)
      }
      group.region = row.region
      group.regionArea = row.area
      group.regionSource = row.region_source === 'manual' ? 'manual' : null
      if (!group.encryptedId && row.netease_encrypted_id) {
        group.encryptedId = row.netease_encrypted_id
      }
    }

    // 无网易云 ID 的名字桶 / 仅加密 ID 桶：仅当名字唯一对应一个 netease: 桶时合并。
    // 同名不同 ID（MONO / Ground-Zero）保持分列；home alone. 这类 originalId=0
    // 但有加密 ID 的桶也会并入唯一同名 netease 桶（当前库实测存在）。
    const nameToNeteaseGroups = new Map<string, ArtistBrowserKey[]>()
    for (const [key, group] of groups) {
      if (!key.startsWith('netease:')) continue
      for (const name of group.names.keys()) {
        const normalized = nameKey(name)
        const list = nameToNeteaseGroups.get(normalized) ?? []
        if (!list.includes(key)) list.push(key)
        nameToNeteaseGroups.set(normalized, list)
      }
    }

    const findUniqueNeteaseTarget = (group: ArtistGroup): ArtistBrowserKey | null => {
      let target: ArtistBrowserKey | null = null
      for (const name of group.names.keys()) {
        const candidates = nameToNeteaseGroups.get(nameKey(name)) ?? []
        if (candidates.length !== 1) return null
        if (target == null) {
          target = candidates[0]
        } else if (target !== candidates[0]) {
          return null
        }
      }
      return target
    }

    for (const [key, group] of [...groups]) {
      const isNameGroup = key.startsWith('name:')
      const isEncryptedGroup = key.startsWith('encrypted:')
      if (!isNameGroup && !isEncryptedGroup) continue

      const targetKey = findUniqueNeteaseTarget(group)
      if (!targetKey) continue
      const target = groups.get(targetKey)
      if (!target) continue

      for (const [name, count] of group.names) {
        target.names.set(name, (target.names.get(name) ?? 0) + count)
      }
      for (const [albumId, item] of group.albums) {
        const existing = target.albums.get(albumId)
        if (existing) {
          existing.isPrimary = existing.isPrimary || item.isPrimary
        } else {
          target.albums.set(albumId, item)
        }
      }
      if (!target.encryptedId && group.encryptedId) {
        target.encryptedId = group.encryptedId
      }
      groups.delete(key)
    }

    return groups
  }
}