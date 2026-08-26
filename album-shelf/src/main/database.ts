import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database | null = null

const CREATE_ALBUM_TABLE = `
CREATE TABLE IF NOT EXISTS album (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  netease_album_id TEXT NOT NULL UNIQUE,
  netease_original_id INTEGER,
  musicbrainz_id TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  cover_url TEXT,
  release_date TEXT,
  mb_rating REAL,
  mb_rating_count INTEGER,
  track_count INTEGER,
  synced_at TEXT NOT NULL,
  enriched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

const CREATE_TRACK_TABLE = `
CREATE TABLE IF NOT EXISTS track (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL,
  netease_song_id TEXT,
  netease_original_id INTEGER,
  title TEXT NOT NULL,
  artist TEXT,
  track_number INTEGER NOT NULL,
  disc_number INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (album_id) REFERENCES album(id) ON DELETE CASCADE
);
`

const CREATE_GENRE_TABLE = `
CREATE TABLE IF NOT EXISTS genre (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
`

const CREATE_ALBUM_GENRE_TABLE = `
CREATE TABLE IF NOT EXISTS album_genre (
  album_id INTEGER NOT NULL,
  genre_id INTEGER NOT NULL,
  FOREIGN KEY (album_id) REFERENCES album(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genre(id) ON DELETE CASCADE,
  UNIQUE (album_id, genre_id)
);
`

// 关注艺术家（关注粒度 = 拆分后的单个艺术家名；ID 字段可空，供后续按 artistId 查询网易云数据）
const CREATE_FOLLOWED_ARTIST_TABLE = `
CREATE TABLE IF NOT EXISTS followed_artist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  original_id INTEGER,
  encrypted_id TEXT,
  followed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

export function initDatabase(): Database.Database {
  if (db) {
    return db
  }

  const dbPath = join(app.getPath('userData'), 'album-shelf.db')

  db = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL')
  // Enable foreign keys
  db.pragma('foreign_keys = ON')

  // Create tables
  db.exec(CREATE_ALBUM_TABLE)
  db.exec(CREATE_TRACK_TABLE)
  db.exec(CREATE_GENRE_TABLE)
  db.exec(CREATE_ALBUM_GENRE_TABLE)
  db.exec(CREATE_FOLLOWED_ARTIST_TABLE)

  // Migration: album table
  const albumColumns = db
    .prepare("PRAGMA table_info('album')")
    .all() as { name: string }[]
  // Rename netease_id → netease_album_id
  if (albumColumns.some((c) => c.name === 'netease_id')) {
    db.exec('ALTER TABLE album RENAME COLUMN netease_id TO netease_album_id')
  }
  // Add netease_original_id if missing
  if (!albumColumns.some((c) => c.name === 'netease_original_id')) {
    db.exec('ALTER TABLE album ADD COLUMN netease_original_id INTEGER')
  }
  // Add user_rating if missing
  if (!albumColumns.some((c) => c.name === 'user_rating')) {
    db.exec('ALTER TABLE album ADD COLUMN user_rating REAL')
  }
  // Add physical_media if missing (实体介质标记：vinyl/cd/cassette，逗号分隔，可空)
  if (!albumColumns.some((c) => c.name === 'physical_media')) {
    db.exec('ALTER TABLE album ADD COLUMN physical_media TEXT')
  }
  // Add artist_ids if missing (艺术家网易云 ID JSON 数组，与 artist 字段拆分顺序对齐，可空)
  if (!albumColumns.some((c) => c.name === 'artist_ids')) {
    db.exec('ALTER TABLE album ADD COLUMN artist_ids TEXT')
  }

  // Migration: track table
  const trackColumns = db
    .prepare("PRAGMA table_info('track')")
    .all() as { name: string }[]
  // Rename netease_id → netease_song_id
  if (trackColumns.some((c) => c.name === 'netease_id')) {
    db.exec('ALTER TABLE track RENAME COLUMN netease_id TO netease_song_id')
  }
  // Add netease_original_id if missing
  if (!trackColumns.some((c) => c.name === 'netease_original_id')) {
    db.exec('ALTER TABLE track ADD COLUMN netease_original_id INTEGER')
  }

  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export interface ExportData {
  version: 2
  exportedAt: string
  data: {
    albums: Record<string, unknown>[]
    tracks: Record<string, unknown>[]
    genres: Record<string, unknown>[]
    albumGenres: Record<string, unknown>[]
    followedArtists: Record<string, unknown>[]
  }
}

export function exportDatabase(): ExportData {
  const database = getDatabase()
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      albums: database.prepare('SELECT * FROM album').all() as Record<string, unknown>[],
      tracks: database.prepare('SELECT * FROM track').all() as Record<string, unknown>[],
      genres: database.prepare('SELECT * FROM genre').all() as Record<string, unknown>[],
      albumGenres: database.prepare('SELECT * FROM album_genre').all() as Record<string, unknown>[],
      followedArtists: database.prepare('SELECT * FROM followed_artist').all() as Record<string, unknown>[]
    }
  }
}

export interface ImportResult {
  albumsAdded: number
  albumsUpdated: number
  tracksImported: number
  genresImported: number
  followedArtistsImported: number
}

/** 导入文件可接受的版本（v2 = 当前格式；v1 = 无 followedArtists 与 artist_ids 的历史格式） */
export type ImportData = Omit<ExportData, 'version'> & { version: 1 | 2 }

export function importDatabase(data: ImportData): ImportResult {
  const database = getDatabase()

  if (data.version !== 1 && data.version !== 2) {
    throw new Error(`不支持的导出版本: ${data.version}`)
  }

  const result: ImportResult = { albumsAdded: 0, albumsUpdated: 0, tracksImported: 0, genresImported: 0, followedArtistsImported: 0 }

  const importTx = database.transaction(() => {
    // 1. Import genres (upsert by name)
    const upsertGenre = database.prepare(
      'INSERT INTO genre (name) VALUES (?) ON CONFLICT(name) DO NOTHING'
    )
    for (const genre of data.data.genres) {
      upsertGenre.run(genre.name)
    }
    result.genresImported = data.data.genres.length

    // Build old-id → new-id map for genres
    const genreIdMap = new Map<number, number>()
    for (const genre of data.data.genres) {
      const row = database.prepare('SELECT id FROM genre WHERE name = ?').get(genre.name) as { id: number }
      genreIdMap.set(genre.id as number, row.id)
    }

    // 2. Import albums (upsert by netease_album_id)
    const albumIdMap = new Map<number, number>()
    for (const album of data.data.albums) {
      const existing = database.prepare('SELECT id FROM album WHERE netease_album_id = ?').get(album.netease_album_id) as { id: number } | undefined

      if (existing) {
        database.prepare(`
          UPDATE album SET
            title = ?, artist = ?, cover_url = ?, release_date = ?,
            musicbrainz_id = ?, mb_rating = ?, mb_rating_count = ?,
            track_count = ?, enriched_at = ?, user_rating = ?,
            netease_original_id = ?, physical_media = ?, artist_ids = ?
          WHERE id = ?
        `).run(
          album.title, album.artist, album.cover_url, album.release_date,
          album.musicbrainz_id, album.mb_rating, album.mb_rating_count,
          album.track_count, album.enriched_at, album.user_rating,
          album.netease_original_id, album.physical_media,
          album.artist_ids ?? null, existing.id
        )
        albumIdMap.set(album.id as number, existing.id)
        result.albumsUpdated++
      } else {
        const info = database.prepare(`
          INSERT INTO album (netease_album_id, netease_original_id, musicbrainz_id, title, artist,
            cover_url, release_date, mb_rating, mb_rating_count, track_count, synced_at, enriched_at, user_rating,
            physical_media, artist_ids)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          album.netease_album_id, album.netease_original_id, album.musicbrainz_id,
          album.title, album.artist, album.cover_url, album.release_date,
          album.mb_rating, album.mb_rating_count, album.track_count,
          album.synced_at || new Date().toISOString(), album.enriched_at, album.user_rating,
          album.physical_media, album.artist_ids ?? null
        )
        albumIdMap.set(album.id as number, info.lastInsertRowid as number)
        result.albumsAdded++
      }
    }

    // 3. Import tracks (delete existing + re-insert for imported albums)
    const deleteTracksByAlbum = database.prepare('DELETE FROM track WHERE album_id = ?')
    const insertTrack = database.prepare(`
      INSERT INTO track (album_id, netease_song_id, netease_original_id, title, artist,
        track_number, disc_number, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const albumsWithTracks = new Set<number>()
    for (const track of data.data.tracks) {
      const newAlbumId = albumIdMap.get(track.album_id as number)
      if (!newAlbumId) continue
      if (!albumsWithTracks.has(newAlbumId)) {
        deleteTracksByAlbum.run(newAlbumId)
        albumsWithTracks.add(newAlbumId)
      }
      insertTrack.run(
        newAlbumId, track.netease_song_id, track.netease_original_id,
        track.title, track.artist, track.track_number, track.disc_number, track.duration_ms
      )
      result.tracksImported++
    }

    // 4. Import album_genre associations
    const deleteAlbumGenres = database.prepare('DELETE FROM album_genre WHERE album_id = ?')
    const insertAlbumGenre = database.prepare(
      'INSERT OR IGNORE INTO album_genre (album_id, genre_id) VALUES (?, ?)'
    )
    const importedAlbumsWithGenres = new Set<number>()
    for (const ag of data.data.albumGenres) {
      const newAlbumId = albumIdMap.get(ag.album_id as number)
      const newGenreId = genreIdMap.get(ag.genre_id as number)
      if (!newAlbumId || !newGenreId) continue
      if (!importedAlbumsWithGenres.has(newAlbumId)) {
        deleteAlbumGenres.run(newAlbumId)
        importedAlbumsWithGenres.add(newAlbumId)
      }
      insertAlbumGenre.run(newAlbumId, newGenreId)
    }

    // 5. Import followed artists (v2 起；按 name upsert，已存在时仅填补缺失的 ID 字段)
    const followedArtists = data.data.followedArtists ?? []
    const mergeFollowedArtist = database.prepare(`
      INSERT INTO followed_artist (name, original_id, encrypted_id)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        original_id = COALESCE(followed_artist.original_id, excluded.original_id),
        encrypted_id = COALESCE(followed_artist.encrypted_id, excluded.encrypted_id)
    `)
    for (const fa of followedArtists) {
      mergeFollowedArtist.run(fa.name, fa.original_id ?? null, fa.encrypted_id ?? null)
    }
    result.followedArtistsImported = followedArtists.length
  })

  importTx()
  return result
}
