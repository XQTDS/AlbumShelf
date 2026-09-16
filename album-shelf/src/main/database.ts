import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { normalizeGenreKey } from './genre-name'

let db: Database.Database | null = null

const CREATE_ALBUM_TABLE = `
CREATE TABLE IF NOT EXISTS album (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  netease_album_id TEXT NOT NULL UNIQUE,
  netease_original_id INTEGER,
  musicbrainz_id TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  artists TEXT,
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
  name TEXT NOT NULL UNIQUE,
  mb_genre_id TEXT
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

// 关注艺术家的新专辑动态条目。
//
// 独立于 album 表：手动同步会删除「不在网易云收藏列表」的本地专辑
// （sync-manager.ts），动态条目若写进 album 会被下次同步整片删掉。
// 因此动态流自成一张表，未入库条目封面走远程直链（不进 cover:// 缓存）。
//
// album_id 是加密专辑 ID，与 album.netease_album_id 同域，可直接比对判断「已入库」；
// original_id 是明文 ID，仅供网易云网页跳转（来自 album get，几乎不会为空）。
const CREATE_ARTIST_UPDATE_TABLE = `
CREATE TABLE IF NOT EXISTS artist_update (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_name TEXT NOT NULL,
  album_id TEXT NOT NULL,
  original_id INTEGER,
  title TEXT NOT NULL,
  publish_time INTEGER,
  release_date TEXT,
  cover_url TEXT,
  category TEXT NOT NULL,
  track_count INTEGER,
  duration_ms INTEGER,
  found_at TEXT NOT NULL DEFAULT (datetime('now')),
  seen_at TEXT,
  UNIQUE (artist_name, album_id)
);
`

const CREATE_ARTIST_UPDATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_artist_update_seen ON artist_update(seen_at);
CREATE INDEX IF NOT EXISTS idx_artist_update_found ON artist_update(found_at DESC);
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
  db.exec(CREATE_ARTIST_UPDATE_TABLE)
  db.exec(CREATE_ARTIST_UPDATE_INDEXES)

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
  // Add artists if missing (结构化艺术家 JSON [{name, originalId, id}]，NULL = 未回填；真源，artist 文本为其派生展示)
  if (!albumColumns.some((c) => c.name === 'artists')) {
    db.exec('ALTER TABLE album ADD COLUMN artists TEXT')
  }
  // Add external_links if missing (外部站点链接 JSON，如 {"discogs":"https://www.discogs.com/master/21491"}。
  // NULL = 未回填（详情面板打开时惰性查询），'{}' = 已查询过但无任何白名单链接 —— 两者必须区分，
  // 否则「确实没有链接」的专辑每次打开面板都会重查一遍，见 external-links.ts)
  if (!albumColumns.some((c) => c.name === 'external_links')) {
    db.exec('ALTER TABLE album ADD COLUMN external_links TEXT')
  }
  // Drop artist_ids if present (从未随版本发布的冗余列；best-effort，失败仅告警，保留无害)
  if (albumColumns.some((c) => c.name === 'artist_ids')) {
    try {
      db.exec('ALTER TABLE album DROP COLUMN artist_ids')
    } catch (error) {
      console.warn('[Database] 删除冗余列 artist_ids 失败（保留无害）:', error)
    }
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

  // Migration: genre table
  const genreColumns = db
    .prepare("PRAGMA table_info('genre')")
    .all() as { name: string }[]
  // Add mb_genre_id if missing（MusicBrainz 风格 UUID；来源标记，NULL = 非 MB 同步而来，
  // 如历史手动标签或补全流程自动建档。风格库同步只补空值，不改 name/id，见 genre-library-service.ts）
  if (!genreColumns.some((c) => c.name === 'mb_genre_id')) {
    db.exec('ALTER TABLE genre ADD COLUMN mb_genre_id TEXT')
  }

  // Migration: followed_artist table
  const followedArtistColumns = db
    .prepare("PRAGMA table_info('followed_artist')")
    .all() as { name: string }[]
  // Add last_checked_at if missing（新专辑动态检查的增量水位线；NULL = 从未检查过，
  // 首次检查回溯 90 天基线。仅在该艺人检查成功时推进，失败不推进以免永久漏检）
  if (!followedArtistColumns.some((c) => c.name === 'last_checked_at')) {
    db.exec('ALTER TABLE followed_artist ADD COLUMN last_checked_at TEXT')
  }

  // Migration: artist_update table
  const artistUpdateColumns = db
    .prepare("PRAGMA table_info('artist_update')")
    .all() as { name: string }[]
  // Add track_count / duration_ms if missing（曲目数与总时长，用于区分单曲与正式专辑）。
  // 已有行为 NULL，下次检查时由「补拉 tracks 并 UPDATE」的自愈路径填上，无需手动清库
  if (!artistUpdateColumns.some((c) => c.name === 'track_count')) {
    db.exec('ALTER TABLE artist_update ADD COLUMN track_count INTEGER')
  }
  if (!artistUpdateColumns.some((c) => c.name === 'duration_ms')) {
    db.exec('ALTER TABLE artist_update ADD COLUMN duration_ms INTEGER')
  }

  // Data migration: 合并历史重复风格行（同名 = 归一化后同名，见 genre-name.ts）
  mergeDuplicateGenres(db)

  return db
}

interface GenreRow {
  id: number
  name: string
  mb_genre_id: string | null
}

/**
 * 一次性合并历史重复风格行（幂等）。
 *
 * 背景：风格库同步（大小写不敏感去重）与专辑写入（历史上的精确匹配 INSERT OR IGNORE）
 * 口径不一致，导致同名风格可能存在多行 —— 例如 `Impressionism`（带 MB UUID，无专辑）
 * 与 `impressionism`（无 UUID，挂着专辑）；`choral symphony` 与带换行符的
 * `choral symphony\n`。写入路径已修（album-service.ts 的 setAlbumGenres），此处清理存量。
 *
 * 规则：同组胜者优先「持有 mb_genre_id」的行，并列取最小 id；败者的专辑关联改指胜者后
 * 删除该行。全程单事务，不丢任何专辑↔风格关联；无重复时零写入。
 */
function mergeDuplicateGenres(db: Database.Database): void {
  const rows = db
    .prepare('SELECT id, name, mb_genre_id FROM genre ORDER BY id')
    .all() as GenreRow[]

  const groups = new Map<string, GenreRow[]>()
  for (const row of rows) {
    const key = normalizeGenreKey(row.name)
    const list = groups.get(key)
    if (list) {
      list.push(row)
    } else {
      groups.set(key, [row])
    }
  }

  const repoint = db.prepare(
    `INSERT OR IGNORE INTO album_genre (album_id, genre_id)
     SELECT album_id, ? FROM album_genre WHERE genre_id = ?`
  )
  const unlink = db.prepare('DELETE FROM album_genre WHERE genre_id = ?')
  const removeGenre = db.prepare('DELETE FROM genre WHERE id = ?')

  const merge = db.transaction(() => {
    let mergedGroups = 0
    let deletedRows = 0

    for (const group of groups.values()) {
      if (group.length < 2) continue

      const winner = group.find((r) => r.mb_genre_id) ?? group.reduce((a, b) => (a.id <= b.id ? a : b))

      for (const loser of group) {
        if (loser.id === winner.id) continue
        repoint.run(winner.id, loser.id)
        unlink.run(loser.id)
        removeGenre.run(loser.id)
        deletedRows++
      }
      mergedGroups++
    }

    return { mergedGroups, deletedRows }
  })

  const { mergedGroups, deletedRows } = merge()
  if (mergedGroups > 0) {
    console.log(`[Database] 合并重复风格 ${mergedGroups} 组，删除 ${deletedRows} 行孤儿风格`)
  }
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

/** 导入文件可接受的版本（v2 = 当前格式；v1 = 无 followedArtists 与 artists 结构化字段的历史格式） */
export type ImportData = Omit<ExportData, 'version'> & { version: 1 | 2 }

export function importDatabase(data: ImportData): ImportResult {
  const database = getDatabase()

  if (data.version !== 1 && data.version !== 2) {
    throw new Error(`不支持的导出版本: ${data.version}`)
  }

  const result: ImportResult = { albumsAdded: 0, albumsUpdated: 0, tracksImported: 0, genresImported: 0, followedArtistsImported: 0 }

  const importTx = database.transaction(() => {
    // 1. Import genres (upsert by name；已存在时只补空着的 mb_genre_id，
    //    不改 name/id，避免破坏既有 album_genre 映射；旧版导出无该字段 → 写入 NULL)
    const upsertGenre = database.prepare(`
      INSERT INTO genre (name, mb_genre_id) VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET
        mb_genre_id = COALESCE(genre.mb_genre_id, excluded.mb_genre_id)
    `)
    for (const genre of data.data.genres) {
      upsertGenre.run(genre.name, genre.mb_genre_id ?? null)
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
            netease_original_id = ?, physical_media = ?, artists = ?,
            external_links = ?
          WHERE id = ?
        `).run(
          album.title, album.artist, album.cover_url, album.release_date,
          album.musicbrainz_id, album.mb_rating, album.mb_rating_count,
          album.track_count, album.enriched_at, album.user_rating,
          album.netease_original_id, album.physical_media,
          album.artists ?? null, album.external_links ?? null, existing.id
        )
        albumIdMap.set(album.id as number, existing.id)
        result.albumsUpdated++
      } else {
        const info = database.prepare(`
          INSERT INTO album (netease_album_id, netease_original_id, musicbrainz_id, title, artist,
            cover_url, release_date, mb_rating, mb_rating_count, track_count, synced_at, enriched_at, user_rating,
            physical_media, artists, external_links)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          album.netease_album_id, album.netease_original_id, album.musicbrainz_id,
          album.title, album.artist, album.cover_url, album.release_date,
          album.mb_rating, album.mb_rating_count, album.track_count,
          album.synced_at || new Date().toISOString(), album.enriched_at, album.user_rating,
          album.physical_media, album.artists ?? null, album.external_links ?? null
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
