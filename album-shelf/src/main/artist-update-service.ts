import Database from 'better-sqlite3'
import { getDatabase } from './database'

// ==================== Types ====================

/**
 * 动态条目分类
 *
 * - `own`：该艺人名下发行。注意**不等于「新作品」**——精选集、Remastered 重发、
 *   单曲重新上架都会落到这一类，因为它们确实是「本人名下、在该时间窗内发行」。
 *   这是 bypubtime 接口的固有语义，无法靠规则区分，UI 文案需相应措辞。
 * - `participation`：参与作品（合辑、OST、群星、多人合作）。实测占比可观，弱化展示。
 */
export type ArtistUpdateCategory = 'own' | 'participation'

/** 一条关注艺术家的新专辑动态 */
export interface ArtistUpdate {
  id: number
  artist_name: string
  /** 加密专辑 ID，与 album.netease_album_id 同域 */
  album_id: string
  /** 明文专辑 ID，供网易云网页跳转；来自 album get，几乎不会为空 */
  original_id: number | null
  title: string
  publish_time: number | null
  release_date: string | null
  cover_url: string | null
  category: ArtistUpdateCategory
  /** 曲目数；NULL = 尚未取到（老数据或 album tracks 失败），UI 需容忍 */
  track_count: number | null
  /** 总时长（毫秒）；NULL 同上 */
  duration_ms: number | null
  found_at: string
  /** NULL = 未读 */
  seen_at: string | null
}

/** 落库入参 */
export interface ArtistUpdateInsert {
  artist_name: string
  album_id: string
  original_id?: number | null
  title: string
  publish_time?: number | null
  release_date?: string | null
  cover_url?: string | null
  category: ArtistUpdateCategory
  track_count?: number | null
  duration_ms?: number | null
  /** true = 落库即标记已读（首启基线批次用，避免未读洪泛） */
  seen?: boolean
}

// ==================== ArtistUpdateService ====================

export class ArtistUpdateService {
  private db: Database.Database

  constructor() {
    this.db = getDatabase()
  }

  /**
   * 插入一条动态。
   *
   * UNIQUE(artist_name, album_id) 保证幂等：同一艺人的同一张专辑重复检查不会产生第二行，
   * 也不会覆盖已有行的 seen_at（用户的已读状态不能被重跑冲掉）。
   *
   * @returns 是否真的新增了一行
   */
  insert(entry: ArtistUpdateInsert): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO artist_update
           (artist_name, album_id, original_id, title, publish_time,
            release_date, cover_url, category, track_count, duration_ms, seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.artist_name,
        entry.album_id,
        entry.original_id ?? null,
        entry.title,
        entry.publish_time ?? null,
        entry.release_date ?? null,
        entry.cover_url ?? null,
        entry.category,
        entry.track_count ?? null,
        entry.duration_ms ?? null,
        entry.seen ? new Date().toISOString() : null
      )
    return result.changes > 0
  }

  /**
   * 动态列表。
   *
   * 排序：未读优先 → 本人名下发行优先 → 发行日期倒序。
   * 这样「有新东西可看」永远在最上面，参与作品沉底。
   */
  list(unreadOnly: boolean = false): ArtistUpdate[] {
    const where = unreadOnly ? 'WHERE seen_at IS NULL' : ''
    return this.db
      .prepare(
        `SELECT * FROM artist_update
         ${where}
         ORDER BY
           CASE WHEN seen_at IS NULL THEN 0 ELSE 1 END,
           CASE WHEN category = 'own' THEN 0 ELSE 1 END,
           COALESCE(release_date, '') DESC,
           found_at DESC`
      )
      .all() as ArtistUpdate[]
  }

  /** 未读条数（Tab 标题角标用） */
  unreadCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM artist_update WHERE seen_at IS NULL')
      .get() as { c: number }
    return row.c
  }

  /** 标记单条已读。已读的条目重复标记不改变原时间。 */
  markRead(id: number): boolean {
    const result = this.db
      .prepare(
        "UPDATE artist_update SET seen_at = ? WHERE id = ? AND seen_at IS NULL"
      )
      .run(new Date().toISOString(), id)
    return result.changes > 0
  }

  /** 全部标记已读，返回受影响条数 */
  markAllRead(): number {
    const result = this.db
      .prepare('UPDATE artist_update SET seen_at = ? WHERE seen_at IS NULL')
      .run(new Date().toISOString())
    return result.changes
  }

  /**
   * 该艺人的该专辑在库中的状态。
   *
   * 检查流程用它在调用 album get **之前**决定要不要花调用配额：
   * - `'missing'`：全新条目，需 album get + album tracks
   * - `'incomplete'`：已收录但缺曲目信息（老数据，或上次 album tracks 失败）——
   *   只需补 album tracks 并 UPDATE，省掉一次 album get
   * - `'complete'`：完全跳过，零调用
   *
   * 这也让「部分失败不推进水位线」的重跑代价可控：重跑只补真正缺的那部分。
   */
  entryStatus(artistName: string, albumId: string): 'missing' | 'incomplete' | 'complete' {
    const row = this.db
      .prepare(
        'SELECT id, track_count FROM artist_update WHERE artist_name = ? AND album_id = ?'
      )
      .get(artistName.trim(), albumId) as { id: number; track_count: number | null } | undefined
    if (!row) return 'missing'
    return row.track_count == null ? 'incomplete' : 'complete'
  }

  /** 为已有条目补上曲目数与总时长（自愈路径：老数据 / 上次 tracks 拉取失败） */
  fillTrackInfo(
    artistName: string,
    albumId: string,
    trackCount: number,
    durationMs: number
  ): boolean {
    const result = this.db
      .prepare(
        `UPDATE artist_update SET track_count = ?, duration_ms = ?
         WHERE artist_name = ? AND album_id = ?`
      )
      .run(trackCount, durationMs, artistName.trim(), albumId)
    return result.changes > 0
  }

  /** 删除某艺人的全部动态（取关时级联清理，避免孤儿条目） */
  deleteByArtist(artistName: string): number {
    const result = this.db
      .prepare('DELETE FROM artist_update WHERE artist_name = ?')
      .run(artistName.trim())
    return result.changes
  }
}
