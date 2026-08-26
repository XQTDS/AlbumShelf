import Database from 'better-sqlite3'
import { getDatabase } from './database'

// ==================== Types ====================

/** 已关注的艺术家（关注粒度 = 拆分后的单个艺术家名） */
export interface FollowedArtist {
  id: number
  name: string
  original_id: number | null
  encrypted_id: string | null
  followed_at: string
  /** 该艺术家在库中的专辑数（按拆分后名字匹配统计，展示用） */
  album_count: number
}

// ==================== FollowedArtistService ====================

/** 艺术家文本拆分（与渲染层 App.vue 的 splitArtists 同语义，勿改单边） */
export function splitArtistText(artist: string): string[] {
  return artist.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean)
}

export class FollowedArtistService {
  private db: Database.Database

  constructor() {
    this.db = getDatabase()
  }

  /**
   * 关注艺术家。
   * name 已存在时仅合并补充缺失的 ID 字段（不覆盖已有 ID），返回是否新增。
   */
  follow(name: string, originalId?: number | null, encryptedId?: string | null): boolean {
    const trimmed = name.trim()
    const existed = this.isFollowed(trimmed)
    this.db
      .prepare(
        `INSERT INTO followed_artist (name, original_id, encrypted_id)
         VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           original_id = COALESCE(followed_artist.original_id, excluded.original_id),
           encrypted_id = COALESCE(followed_artist.encrypted_id, excluded.encrypted_id)`
      )
      .run(trimmed, originalId ?? null, encryptedId ?? null)
    return !existed
  }

  /** 取关艺术家。返回是否真的删除了行。 */
  unfollow(name: string): boolean {
    const result = this.db.prepare('DELETE FROM followed_artist WHERE name = ?').run(name.trim())
    return result.changes > 0
  }

  isFollowed(name: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM followed_artist WHERE name = ?').get(name.trim())
  }

  /** 返回全部已关注艺术家名（供筛选匹配用） */
  getFollowedNames(): string[] {
    const rows = this.db
      .prepare('SELECT name FROM followed_artist ORDER BY followed_at DESC')
      .all() as { name: string }[]
    return rows.map((r) => r.name)
  }

  /** 关注列表（含专辑数）。专辑数通过一次全表扫描在 JS 中按拆分名统计（库规模千级，微秒级）。 */
  list(): FollowedArtist[] {
    const rows = this.db
      .prepare('SELECT * FROM followed_artist ORDER BY followed_at DESC, id DESC')
      .all() as Omit<FollowedArtist, 'album_count'>[]

    const albumRows = this.db.prepare('SELECT artist FROM album').all() as { artist: string }[]
    const counts = new Map<string, number>()
    for (const { artist } of albumRows) {
      for (const name of splitArtistText(artist)) {
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }

    return rows.map((row) => ({ ...row, album_count: counts.get(row.name) ?? 0 }))
  }

  /**
   * 为缺失 ID 的关注记录按名字匹配补齐网易云 ID（来自 album.artist_ids 已回填的数据）。
   * 回填任务完成后调用；只补缺失字段（COALESCE），不覆盖已有值。返回补全的记录数。
   */
  fillMissingIdsFromAlbums(): number {
    const missing = this.db
      .prepare(
        'SELECT id, name FROM followed_artist WHERE original_id IS NULL OR encrypted_id IS NULL'
      )
      .all() as { id: number; name: string }[]
    if (missing.length === 0) return 0

    // 一次全表扫描收集「拆分艺术家名 → 下标 → ID」信息（artist_ids 与 artist 文本同源对齐）
    const albumRows = this.db
      .prepare("SELECT artist, artist_ids FROM album WHERE artist_ids IS NOT NULL AND artist_ids != ''")
      .all() as { artist: string; artist_ids: string }[]

    let filled = 0
    for (const row of missing) {
      for (const album of albumRows) {
        const idx = splitArtistText(album.artist).indexOf(row.name)
        if (idx < 0) continue
        try {
          const ids = JSON.parse(album.artist_ids) as { originalId?: number; id?: string }[]
          const match = ids[idx]
          if (!match || (match.originalId == null && match.id == null)) continue
          this.db
            .prepare(
              `UPDATE followed_artist
               SET original_id = COALESCE(followed_artist.original_id, ?),
                   encrypted_id = COALESCE(followed_artist.encrypted_id, ?)
               WHERE id = ?`
            )
            .run(match.originalId ?? null, match.id ?? null, row.id)
          filled++
          break
        } catch {
          // 损坏 JSON 跳过该专辑
        }
      }
    }
    return filled
  }
}
