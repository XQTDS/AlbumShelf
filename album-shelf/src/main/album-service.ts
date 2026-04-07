import Database from 'better-sqlite3'
import { getDatabase } from './database'

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
  track_count?: number | null
  enriched_at?: string | null
}

export interface AlbumQueryOptions {
  search?: string
  artist?: string
  genre?: string
  sortBy?: 'mb_rating' | 'release_date'
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
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
        `INSERT INTO album (netease_album_id, netease_original_id, title, artist, cover_url, release_date, track_count, synced_at)
         VALUES (@netease_album_id, @netease_original_id, @title, @artist, @cover_url, @release_date, @track_count, @synced_at)`
      )
      .run({
        netease_album_id: album.netease_album_id,
        netease_original_id: album.netease_original_id ?? null,
        title: album.title,
        artist: album.artist,
        cover_url: album.cover_url ?? null,
        release_date: album.release_date ?? null,
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
      genre,
      sortBy,
      sortOrder = 'desc',
      page = 1,
      pageSize = 20
    } = options

    const conditions: string[] = []
    const params: Record<string, unknown> = {}

    // Search filter (case-insensitive on title and artist)
    if (search) {
      conditions.push('(LOWER(a.title) LIKE @search OR LOWER(a.artist) LIKE @search)')
      params.search = `%${search.toLowerCase()}%`
    }

    // Artist filter
    if (artist) {
      conditions.push('a.artist = @artist')
      params.artist = artist
    }

    // Genre filter (join with album_genre and genre)
    let genreJoin = ''
    if (genre) {
      genreJoin = `
        INNER JOIN album_genre ag ON a.id = ag.album_id
        INNER JOIN genre g ON ag.genre_id = g.id
      `
      conditions.push('g.name = @genre')
      params.genre = genre
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Count total
    const countSql = `SELECT COUNT(DISTINCT a.id) as total FROM album a ${genreJoin} ${whereClause}`
    const { total } = this.db.prepare(countSql).get(params) as { total: number }

    // Sort clause
    let orderClause = 'ORDER BY a.created_at DESC'
    if (sortBy === 'mb_rating') {
      // Null ratings go last
      const dir = sortOrder === 'asc' ? 'ASC' : 'DESC'
      orderClause = `ORDER BY CASE WHEN a.mb_rating IS NULL THEN 1 ELSE 0 END, a.mb_rating ${dir}`
    } else if (sortBy === 'release_date') {
      // Null dates go last
      const dir = sortOrder === 'asc' ? 'ASC' : 'DESC'
      orderClause = `ORDER BY CASE WHEN a.release_date IS NULL THEN 1 ELSE 0 END, a.release_date ${dir}`
    }

    // Pagination
    const offset = (page - 1) * pageSize
    params.limit = pageSize
    params.offset = offset

    const dataSql = `
      SELECT DISTINCT a.* FROM album a
      ${genreJoin}
      ${whereClause}
      ${orderClause}
      LIMIT @limit OFFSET @offset
    `

    const rows = this.db.prepare(dataSql).all(params) as Album[]

    // Attach genres to each album
    for (const row of rows) {
      row.genres = this.getGenresForAlbum(row.id)
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
   */
  getAllArtists(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT artist FROM album ORDER BY artist')
      .all() as { artist: string }[]
    return rows.map((r) => r.artist)
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
   * Get all albums (for re-enrichment).
   */
  getAllAlbumsForEnrich(): Album[] {
    const rows = this.db
      .prepare('SELECT * FROM album ORDER BY id')
      .all() as Album[]
    return rows
  }

  /**
   * Reset enrichment status for all albums (clear enriched_at, mb_rating, musicbrainz_id, genres).
   */
  resetAllEnrichment(): void {
    this.db.transaction(() => {
      this.db.prepare('UPDATE album SET enriched_at = NULL, musicbrainz_id = NULL, mb_rating = NULL, mb_rating_count = NULL').run()
      this.db.prepare('DELETE FROM album_genre').run()
    })()
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
}
