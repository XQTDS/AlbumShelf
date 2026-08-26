import Database from 'better-sqlite3'
import { getDatabase } from './database'
import { albumArtistRefs } from './album-artist'

// 拆分语义定义在 album-artist.ts（结构化解析唯一真源）；此处 re-export 兼容旧导入方
export { splitArtistText } from './album-artist'

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

    const albumRows = this.db
      .prepare('SELECT artist, artists FROM album')
      .all() as { artist: string; artists: string | null }[]
    const counts = new Map<string, number>()
    for (const row of albumRows) {
      for (const ref of albumArtistRefs(row)) {
        counts.set(ref.name, (counts.get(ref.name) ?? 0) + 1)
      }
    }

    return rows.map((row) => ({ ...row, album_count: counts.get(row.name) ?? 0 }))
  }

  /**
   * 为缺失 ID 的关注记录按名字匹配补齐网易云 ID（来自 album.artists 已回填的结构化数据）。
   * 回填任务完成后调用；只补缺失字段（COALESCE），不覆盖已有值。返回补全的记录数。
   */
  fillMissingIdsFromAlbums(): number {
    const missing = this.db
      .prepare(
        'SELECT id, name FROM followed_artist WHERE original_id IS NULL OR encrypted_id IS NULL'
      )
      .all() as { id: number; name: string }[]
    if (missing.length === 0) return 0

    // 一次全表扫描收集「艺术家名 → 网易云 ID」信息（结构化 album.artists 为真源，按 name 匹配，
    // 不再依赖文本下标对齐——顺带修复艺术家名含 '/' 时下标错位的隐藏 bug）
    const albumRows = this.db
      .prepare("SELECT artist, artists FROM album WHERE artists IS NOT NULL AND artists != ''")
      .all() as { artist: string; artists: string | null }[]

    let filled = 0
    for (const row of missing) {
      for (const album of albumRows) {
        const match = albumArtistRefs(album).find((ref) => ref.name === row.name)
        if (!match || (match.originalId == null && match.id == null)) continue
        this.db
          .prepare(
            `UPDATE followed_artist
             SET original_id = COALESCE(followed_artist.original_id, ?),
                 encrypted_id = COALESCE(followed_artist.encrypted_id, ?)
             WHERE id = ?`
          )
          .run(match.originalId, match.id, row.id)
        filled++
        break
      }
    }
    return filled
  }
}
