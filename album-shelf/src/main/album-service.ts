import Database from 'better-sqlite3'
import { getDatabase } from './database'
import { FollowedArtistService } from './followed-artist-service'
import { albumArtistRefs } from './album-artist'

// ==================== Types ====================

export interface Album {
  id: number
  netease_album_id: string
  netease_original_id: number | null
  musicbrainz_id: string | null
  title: string
  artist: string
  cover_url: string | null
  release_date: string | null
  mb_rating: number | null
  mb_rating_count: number | null
  user_rating: number | null
  physical_media: string | null
  /** 艺术家结构化 JSON [{name, originalId, id}]（真源）；NULL = 未回填。artist 文本为其派生展示 */
  artists: string | null
  track_count: number | null
  synced_at: string
  enriched_at: string | null
  created_at: string
  genres?: string[]
}

export interface AlbumInsert {
  netease_album_id: string
  netease_original_id?: number | null
  title: string
  artist: string
  cover_url?: string | null
  release_date?: string | null
  artists?: string | null
  track_count?: number | null
  synced_at: string
}

export interface AlbumUpdate {
  musicbrainz_id?: string | null
  title?: string
  artist?: string
  cover_url?: string | null
  release_date?: string | null
  mb_rating?: number | null
  mb_rating_count?: number | null
  user_rating?: number | null
  physical_media?: string | null
  artists?: string | null
  track_count?: number | null
  enriched_at?: string | null
  /** 明文专辑 ID（网易云网页跳转用） */
  netease_original_id?: number | null
}

export interface AlbumQueryOptions {
  search?: string
  artist?: string
  genres?: string  // 逗号分隔的风格列表，如 "Rock,Jazz"
  /** 只看已关注艺术家的专辑（命中 = 专辑任一拆分名在关注列表中） */
  followedOnly?: boolean
  /** 按单个艺术家名部分匹配（"A" 能命中 artist 为 "A/B" 的专辑） */
  artistPartial?: string
  sortBy?: 'mb_rating' | 'release_date' | 'user_rating'
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  // 一次性返回完整结果集（忽略 page/pageSize），用于跳转定位与深拖到底
  fetchAll?: boolean
}

export interface AlbumQueryResult {
  albums: Album[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ==================== AlbumService ====================

export class AlbumService {
  private db: Database.Database

  constructor() {
    this.db = getDatabase()
  }

  /**
   * Insert a new album. If netease_album_id already exists, skip (no update).
   * Returns the album id (existing or newly created).
   */
  insertAlbum(album: AlbumInsert): number {
    const existing = this.db
      .prepare('SELECT id FROM album WHERE netease_album_id = ?')
      .get(album.netease_album_id) as { id: number } | undefined

    if (existing) {
      return existing.id
    }

    const result = this.db
      .prepare(
        `INSERT INTO album (netease_album_id, netease_original_id, title, artist, cover_url, release_date, artists, track_count, synced_at)
         VALUES (@netease_album_id, @netease_original_id, @title, @artist, @cover_url, @release_date, @artists, @track_count, @synced_at)`
      )
      .run({
        netease_album_id: album.netease_album_id,
        netease_original_id: album.netease_original_id ?? null,
        title: album.title,
        artist: album.artist,
        cover_url: album.cover_url ?? null,
        release_date: album.release_date ?? null,
        artists: album.artists ?? null,
        track_count: album.track_count ?? null,
        synced_at: album.synced_at
      })

    return result.lastInsertRowid as number
  }

  /**
   * Batch insert albums using a transaction for performance.
   */
  insertAlbums(albums: AlbumInsert[]): number[] {
    const ids: number[] = []
    const insertMany = this.db.transaction((items: AlbumInsert[]) => {
      for (const album of items) {
        ids.push(this.insertAlbum(album))
      }
    })
    insertMany(albums)
    return ids
  }

  /**
   * 批量补全已有专辑的明文网易云 ID（同步顺带补全跳转链接用）。
   * 仅更新原值为 NULL 的行（SQL 层 `IS NULL` 双保险），已有值不覆盖。
   * @returns 实际补全的行数
   */
  backfillOriginalIds(rows: { id: number; netease_original_id: number }[]): number {
    if (rows.length === 0) return 0

    const update = this.db.prepare(
      'UPDATE album SET netease_original_id = ? WHERE id = ? AND netease_original_id IS NULL'
    )
    const backfillMany = this.db.transaction((items: { id: number; netease_original_id: number }[]) => {
      let count = 0
      for (const row of items) {
        count += update.run(row.netease_original_id, row.id).changes
      }
      return count
    })
    return backfillMany(rows)
  }

  /**
   * Delete albums by netease_album_id.
   * track / album_genre rows are cleaned up by ON DELETE CASCADE.
   * @returns the number of deleted albums
   */
  deleteAlbumsByNeteaseAlbumIds(neteaseAlbumIds: string[]): number {
    if (neteaseAlbumIds.length === 0) return 0

    const placeholders = neteaseAlbumIds.map(() => '?').join(', ')
    const deleteMany = this.db.transaction((ids: string[]) => {
      const result = this.db
        .prepare(`DELETE FROM album WHERE netease_album_id IN (${placeholders})`)
        .run(...ids)
      return result.changes
    })
    return deleteMany(neteaseAlbumIds)
  }

  /**
   * Update an existing album by id.
   */
  updateAlbum(id: number, updates: AlbumUpdate): void {
    const fields: string[] = []
    const values: Record<string, unknown> = { id }

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = @${key}`)
        values[key] = value
      }
    }

    if (fields.length === 0) return

    this.db
      .prepare(`UPDATE album SET ${fields.join(', ')} WHERE id = @id`)
      .run(values)
  }

  /**
   * Get a single album by id, with genres attached.
   */
  getAlbumById(id: number): Album | null {
    const row = this.db
      .prepare('SELECT * FROM album WHERE id = ?')
      .get(id) as Album | undefined

    if (!row) return null

    row.genres = this.getGenresForAlbum(id)
    return row
  }

  /**
   * 仅查询专辑封面 URL（供 cover:// 协议处理器使用，避免附带 genres 查询）。
   */
  getCoverUrlById(id: number): string | null {
    const row = this.db
      .prepare('SELECT cover_url FROM album WHERE id = ?')
      .get(id) as { cover_url: string | null } | undefined

    return row?.cover_url ?? null
  }

  /**
   * Get a single album by netease_album_id (加密专辑 ID).
   */
  getAlbumByNeteaseAlbumId(neteaseAlbumId: string): Album | null {
    const row = this.db
      .prepare('SELECT * FROM album WHERE netease_album_id = ?')
      .get(neteaseAlbumId) as Album | undefined

    if (!row) return null

    row.genres = this.getGenresForAlbum(row.id)
    return row
  }

  /**
   * Query albums with filtering, sorting, searching, and pagination.
   */
  queryAlbums(options: AlbumQueryOptions = {}): AlbumQueryResult {
    const {
      search,
      artist,
      genres,
      followedOnly,
      artistPartial,
      sortBy,
      sortOrder = 'desc',
      page = 1,
      pageSize = 20,
      fetchAll = false
    } = options

    const conditions: string[] = []
    const params: Record<string, unknown> = {}

    // Search filter (case-insensitive on title and artist)
    if (search) {
      conditions.push('(LOWER(a.title) LIKE @search OR LOWER(a.artist) LIKE @search)')
      params.search = `%${search.toLowerCase()}%`
    }

    // Multi-genre filter with AND logic
    // 使用子查询实现：专辑必须同时包含所有选中的风格
    if (genres) {
      const genreList = genres.split(',').map(g => g.trim()).filter(g => g.length > 0)
      if (genreList.length > 0) {
        // 构建 IN 子句的占位符
        const placeholders = genreList.map((_, i) => `@genre${i}`).join(', ')
        genreList.forEach((g, i) => {
          params[`genre${i}`] = g
        })
        params.genreCount = genreList.length

        conditions.push(`a.id IN (
          SELECT ag.album_id FROM album_genre ag
          JOIN genre g ON ag.genre_id = g.id
          WHERE g.name IN (${placeholders})
          GROUP BY ag.album_id
          HAVING COUNT(DISTINCT g.name) = @genreCount
        )`)
      }
    }

    // 已关注艺术家筛选 / 艺术家筛选（精确名或部分匹配）：JS 预计算命中专辑 id 集合 → id IN (...)。
    // 结构化 artists 优先、未回填行回退文本拆分（albumArtistRefs），逐个名字匹配，
    // 保证 "A / B" 合作专辑能被 A 或 B 任一名字命中；
    // 各条件独立计算后取交集（组合筛选保持 AND 语义），单次全表扫描。
    // 库规模千级时全表扫描 + 拆分匹配为微秒级；若未来库增长到万级，可演进为 LIKE-OR 或 album_artist 正规化表。
    if (followedOnly || artist || artistPartial) {
      const rows = this.db
        .prepare('SELECT id, artist, artists FROM album')
        .all() as { id: number; artist: string; artists: string | null }[]
      let matchedIds: number[] | null = null
      const intersect = (ids: number[]): void => {
        const idSet = new Set(ids)
        matchedIds = matchedIds === null ? ids : matchedIds.filter((id) => idSet.has(id))
      }
      if (followedOnly) {
        const followedNames = new Set(new FollowedArtistService().getFollowedNames())
        intersect(
          followedNames.size === 0
            ? [] // 没有关注任何艺术家 → 空结果
            : rows
                .filter((r) => albumArtistRefs(r).some((a) => followedNames.has(a.name)))
                .map((r) => r.id)
        )
      }
      // artist（下拉选择）与 artistPartial（关注窗口/艺术家菜单筛选）UI 互斥、语义一致：拆分后单名匹配
      const singleArtistName = (artist || artistPartial || '').trim()
      if (singleArtistName) {
        intersect(
          rows
            .filter((r) => albumArtistRefs(r).some((a) => a.name === singleArtistName))
            .map((r) => r.id)
        )
      }
      const finalIds = matchedIds ?? []
      if (finalIds.length === 0) {
        return { albums: [], total: 0, page: 1, pageSize, totalPages: 1 }
      }
      finalIds.forEach((id, i) => {
        params[`aid${i}`] = id
      })
      conditions.push(`a.id IN (${finalIds.map((_, i) => `@aid${i}`).join(', ')})`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Count total
    const countSql = `SELECT COUNT(DISTINCT a.id) as total FROM album a ${whereClause}`
    const { total } = this.db.prepare(countSql).get(params) as { total: number }

    // Sort clause (with id DESC as secondary sort key)
    let orderClause = 'ORDER BY a.id DESC'
    if (sortBy === 'mb_rating') {
      // Null ratings go last
      const dir = sortOrder === 'asc' ? 'ASC' : 'DESC'
      orderClause = `ORDER BY CASE WHEN a.mb_rating IS NULL THEN 1 ELSE 0 END, a.mb_rating ${dir}, a.id DESC`
    } else if (sortBy === 'release_date') {
      // Null dates go last
      const dir = sortOrder === 'asc' ? 'ASC' : 'DESC'
      orderClause = `ORDER BY CASE WHEN a.release_date IS NULL THEN 1 ELSE 0 END, a.release_date ${dir}, a.id DESC`
    } else if (sortBy === 'user_rating') {
      // Null user ratings go last
      const dir = sortOrder === 'asc' ? 'ASC' : 'DESC'
      orderClause = `ORDER BY CASE WHEN a.user_rating IS NULL THEN 1 ELSE 0 END, a.user_rating ${dir}, a.id DESC`
    }

    // Pagination（fetchAll 时跳过 LIMIT/OFFSET，一次返回完整结果集）
    let dataSql: string
    if (fetchAll) {
      dataSql = `
        SELECT DISTINCT a.* FROM album a
        ${whereClause}
        ${orderClause}
      `
    } else {
      const offset = (page - 1) * pageSize
      params.limit = pageSize
      params.offset = offset
      dataSql = `
        SELECT DISTINCT a.* FROM album a
        ${whereClause}
        ${orderClause}
        LIMIT @limit OFFSET @offset
      `
    }

    const rows = this.db.prepare(dataSql).all(params) as Album[]

    // Attach genres to each album
    for (const row of rows) {
      row.genres = this.getGenresForAlbum(row.id)
    }

    if (fetchAll) {
      return {
        albums: rows,
        total,
        page: 1,
        pageSize: total,
        totalPages: 1
      }
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return {
      albums: rows,
      total,
      page,
      pageSize,
      totalPages
    }
  }

  /**
   * Get all distinct artists from the database.
   * 多艺术家专辑（如 "A / B"）拆分为单个艺术家名后去重返回（结构化 artists 优先），
   * 避免筛选建议列表出现 "A / B" 这类组合串选项。
   */
  getAllArtists(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT artist, artists FROM album')
      .all() as { artist: string; artists: string | null }[]
    return [...new Set(rows.flatMap((r) => albumArtistRefs(r).map((a) => a.name)))].sort()
  }

  /**
   * Get all genre names from the database.
   */
  getAllGenres(): string[] {
    const rows = this.db
      .prepare('SELECT name FROM genre ORDER BY name')
      .all() as { name: string }[]
    return rows.map((r) => r.name)
  }

  /**
   * Get albums that have not been enriched yet.
   */
  getUnenrichedAlbums(): Album[] {
    const rows = this.db
      .prepare('SELECT * FROM album WHERE enriched_at IS NULL ORDER BY id')
      .all() as Album[]
    return rows
  }

  /**
   * Get albums without cover URL (封面缺失的专辑).
   * 这些专辑 cover_url 为空，需要通过 ncm-cli 批量补全。
   * 按 id 倒序排列，最新收藏的在前面。
   */
  getAlbumsWithoutCover(): Album[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM album
        WHERE (cover_url IS NULL OR cover_url = '')
          AND netease_album_id IS NOT NULL
          AND netease_album_id != ''
        ORDER BY id DESC
      `)
      .all() as Album[]
    return rows
  }

  /**
   * Get albums without release date (发行日期缺失的专辑).
   * 这些专辑 release_date 为空，需要通过 ncm-cli album get 的 publishTime 批量回填。
   * 按 id 倒序排列，最新收藏的在前面。
   */
  getAlbumsWithoutReleaseDate(): Album[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM album
        WHERE (release_date IS NULL OR release_date = '')
          AND netease_album_id IS NOT NULL
          AND netease_album_id != ''
        ORDER BY id DESC
      `)
      .all() as Album[]
    return rows
  }

  /**
   * Get albums without structured artists (结构化艺术家数据缺失的专辑).
   * 这些专辑 artists 为空，需要通过 ncm-cli album get 的 artists 数组批量回填。
   * 按 id 倒序排列，最新收藏的在前面。
   */
  getAlbumsWithoutArtists(): Album[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM album
        WHERE (artists IS NULL OR artists = '')
          AND netease_album_id IS NOT NULL
          AND netease_album_id != ''
        ORDER BY id DESC
      `)
      .all() as Album[]
    return rows
  }

  /**
   * Get albums without genres (风格标签缺失的专辑).
   * 这些是已经尝试补全过，但没有获得任何风格标签的专辑。
   * 按 id 倒序排列，最新收藏的在前面。
   */
  getAlbumsWithoutMbData(): Album[] {
    const rows = this.db
      .prepare(`
        SELECT a.* FROM album a
        WHERE a.musicbrainz_id IS NULL
        ORDER BY a.id DESC
      `)
      .all() as Album[]
    return rows
  }

  /**
   * Get all albums (for re-enrichment).
   */
  getAllAlbumsForEnrich(): Album[] {
    const rows = this.db
      .prepare('SELECT * FROM album ORDER BY id')
      .all() as Album[]
    return rows
  }

  /**
   * Reset enrichment status for all albums (clear enriched_at, mb_rating, musicbrainz_id).
   * 注意：不清空风格标签——非空风格列表受保护，只能手动修改。
   */
  resetAllEnrichment(): void {
    this.db
      .prepare('UPDATE album SET enriched_at = NULL, musicbrainz_id = NULL, mb_rating = NULL, mb_rating_count = NULL')
      .run()
  }

  /**
   * Set genres for an album. Replaces existing genre associations.
   */
  setAlbumGenres(albumId: number, genreNames: string[]): void {
    const setGenres = this.db.transaction((names: string[]) => {
      // Remove existing associations
      this.db.prepare('DELETE FROM album_genre WHERE album_id = ?').run(albumId)

      for (const name of names) {
        // Upsert genre
        this.db
          .prepare('INSERT OR IGNORE INTO genre (name) VALUES (?)')
          .run(name)

        const genre = this.db
          .prepare('SELECT id FROM genre WHERE name = ?')
          .get(name) as { id: number }

        // Create association
        this.db
          .prepare('INSERT OR IGNORE INTO album_genre (album_id, genre_id) VALUES (?, ?)')
          .run(albumId, genre.id)
      }
    })

    setGenres(genreNames)
  }

  /**
   * 仅在专辑当前没有风格标签时写入（保护手动编辑的风格不被自动流程覆盖）。
   * 供数据补全等自动流程使用；手动编辑请直接使用 setAlbumGenres。
   * @returns 是否实际写入
   */
  fillAlbumGenresIfEmpty(albumId: number, genreNames: string[]): boolean {
    if (this.getGenresForAlbum(albumId).length > 0) return false
    this.setAlbumGenres(albumId, genreNames)
    return true
  }

  /**
   * Get genre statistics: each genre name with its album count,
   * plus total albums and albums that have at least one genre.
   */
  getGenreStats(): { stats: { name: string; count: number }[]; totalAlbums: number; albumsWithGenre: number } {
    // 各风格关联的专辑数量（降序）
    const stats = this.db
      .prepare(
        `SELECT g.name, COUNT(ag.album_id) as count
         FROM genre g
         JOIN album_genre ag ON g.id = ag.genre_id
         GROUP BY g.id, g.name
         ORDER BY count DESC`
      )
      .all() as { name: string; count: number }[]

    // 收藏总数
    const { totalAlbums } = this.db
      .prepare('SELECT COUNT(*) as totalAlbums FROM album')
      .get() as { totalAlbums: number }

    // 有风格标签的专辑数（至少关联一个 genre 的专辑）
    const { albumsWithGenre } = this.db
      .prepare('SELECT COUNT(DISTINCT album_id) as albumsWithGenre FROM album_genre')
      .get() as { albumsWithGenre: number }

    return { stats, totalAlbums, albumsWithGenre }
  }

  /**
   * Get genre names for a specific album.
   */
  private getGenresForAlbum(albumId: number): string[] {
    const rows = this.db
      .prepare(
        `SELECT g.name FROM genre g
         INNER JOIN album_genre ag ON g.id = ag.genre_id
         WHERE ag.album_id = ?
         ORDER BY g.name`
      )
      .all(albumId) as { name: string }[]
    return rows.map((r) => r.name)
  }

  /**
   * Get all collected netease IDs for duplicate detection.
   * Returns both original IDs and encrypted album IDs.
   */
  /**
   * Get a random album id from the database.
   * Returns null if no albums exist.
   */
  getRandomAlbumId(): number | null {
    const row = this.db
      .prepare('SELECT id FROM album ORDER BY RANDOM() LIMIT 1')
      .get() as { id: number } | undefined
    return row ? row.id : null
  }

  getCollectedNeteaseIds(): { originalIds: number[], albumIds: string[] } {
    const rows = this.db
      .prepare('SELECT netease_original_id, netease_album_id FROM album')
      .all() as { netease_original_id: number | null, netease_album_id: string }[]
    
    const originalIds = rows
      .filter((r) => r.netease_original_id !== null)
      .map((r) => r.netease_original_id as number)
    
    const albumIds = rows.map((r) => r.netease_album_id)
    
    return { originalIds, albumIds }
  }
}
