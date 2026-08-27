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
  /** 新专辑动态检查的增量水位线；NULL = 从未检查过 */
  last_checked_at: string | null
  /** 该艺术家在库中的专辑数（按拆分后名字匹配统计，展示用） */
  album_count: number
}

/** 参与新专辑动态检查的关注艺术家（只取检查需要的字段） */
export interface FollowedArtistCheckTarget {
  name: string
  /** artist songs 要求加密 ID；为空的艺人无法检查，由调用方跳过并计数 */
  encrypted_id: string | null
  last_checked_at: string | null
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

  /**
   * 取关艺术家。返回是否真的删除了行。
   *
   * 同时级联清理该艺人的新专辑动态条目——否则取关后动态流里会留下孤儿条目，
   * 且再次关注时旧条目会带着过期的已读状态复活。两步放在同一事务里保证原子性。
   */
  unfollow(name: string): boolean {
    const trimmed = name.trim()
    const run = this.db.transaction((artistName: string) => {
      this.db.prepare('DELETE FROM artist_update WHERE artist_name = ?').run(artistName)
      return this.db.prepare('DELETE FROM followed_artist WHERE name = ?').run(artistName)
    })
    return run(trimmed).changes > 0
  }

  /**
   * 参与新专辑动态检查的关注艺术家列表。
   *
   * 返回全部关注记录（含 encrypted_id 为空的）——缺 ID 的艺人由调用方跳过并计入
   * 完成报告，而不是在这里静默过滤掉，否则用户永远不知道有艺人没被检查。
   */
  listCheckTargets(): FollowedArtistCheckTarget[] {
    return this.db
      .prepare(
        'SELECT name, encrypted_id, last_checked_at FROM followed_artist ORDER BY name'
      )
      .all() as FollowedArtistCheckTarget[]
  }

  /**
   * 推进某艺人的检查水位线。
   *
   * **只在该艺人检查成功时调用。** 失败也推进会让这段时间窗被永久漏检，
   * 且没有任何提示——失败不推进，下次重跑会自动从旧水位线补齐。
   */
  updateLastChecked(name: string, checkedAt: string): void {
    this.db
      .prepare('UPDATE followed_artist SET last_checked_at = ? WHERE name = ?')
      .run(checkedAt, name.trim())
  }

  /** 最近一次成功检查的时间（全体关注艺人取最大值）；从未检查过时为 null */
  getLastCheckedAt(): string | null {
    const row = this.db
      .prepare('SELECT MAX(last_checked_at) AS t FROM followed_artist')
      .get() as { t: string | null }
    return row?.t ?? null
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
