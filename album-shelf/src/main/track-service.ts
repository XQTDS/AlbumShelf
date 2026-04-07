import Database from 'better-sqlite3'
import { getDatabase } from './database'

// ==================== Types ====================

export interface Track {
  id: number
  album_id: number
  netease_song_id: string | null
  netease_original_id: number | null
  title: string
  artist: string | null
  track_number: number
  disc_number: number
  duration_ms: number | null
  created_at: string
}

export interface TrackInsert {
  album_id: number
  netease_song_id?: string | null
  netease_original_id?: number | null
  title: string
  artist?: string | null
  track_number: number
  disc_number: number
  duration_ms?: number | null
}

// ==================== TrackService ====================

export class TrackService {
  private db: Database.Database

  constructor() {
    this.db = getDatabase()
  }

  /**
   * Get all tracks for a given album, ordered by disc_number ASC, track_number ASC.
   */
  getTracksByAlbumId(albumId: number): Track[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM track
         WHERE album_id = ?
         ORDER BY disc_number ASC, track_number ASC`
      )
      .all(albumId) as Track[]

    return rows
  }

  /**
   * Delete all tracks for a given album.
   */
  deleteTracksByAlbumId(albumId: number): void {
    this.db.prepare('DELETE FROM track WHERE album_id = ?').run(albumId)
  }

  /**
   * Batch insert tracks using a transaction.
   */
  insertTracks(tracks: TrackInsert[]): void {
    const insertMany = this.db.transaction((items: TrackInsert[]) => {
      const stmt = this.db.prepare(
        `INSERT INTO track (album_id, netease_song_id, netease_original_id, title, artist, track_number, disc_number, duration_ms)
         VALUES (@album_id, @netease_song_id, @netease_original_id, @title, @artist, @track_number, @disc_number, @duration_ms)`
      )

      for (const track of items) {
        stmt.run({
          album_id: track.album_id,
          netease_song_id: track.netease_song_id ?? null,
          netease_original_id: track.netease_original_id ?? null,
          title: track.title,
          artist: track.artist ?? null,
          track_number: track.track_number,
          disc_number: track.disc_number,
          duration_ms: track.duration_ms ?? null
        })
      }
    })

    insertMany(tracks)
  }
}
