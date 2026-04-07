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
