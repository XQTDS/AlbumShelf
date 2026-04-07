import { ElectronAPI } from '@electron-toolkit/preload'

interface AlbumQueryOptions {
  search?: string
  artist?: string
  genre?: string
  sortBy?: 'mb_rating' | 'release_date'
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

interface Album {
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

interface AlbumQueryResult {
  albums: Album[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface Track {
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

interface SyncResult {
  added: number
  skipped: number
  total: number
}

interface EnrichProgress {
  current: number
  total: number
  albumTitle: string
  matched: boolean
}

interface IpcResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

interface AlbumShelfAPI {
  syncStart: () => Promise<IpcResult<SyncResult>>
  albumList: (options: AlbumQueryOptions) => Promise<IpcResult<AlbumQueryResult>>
  albumFilters: () => Promise<IpcResult<{ artists: string[]; genres: string[] }>>
  trackListByAlbum: (albumId: number) => Promise<IpcResult<Track[]>>
  trackSyncByAlbum: (albumId: number) => Promise<IpcResult<Track[]>>
  enrichStatus: () => Promise<
    IpcResult<{ pending: number; enriching: boolean; hasCredentials: boolean }>
  >
  enrichStart: () => Promise<
    IpcResult<{ matched: number; failed: number; total: number }>
  >
  onEnrichProgress: (callback: (progress: EnrichProgress) => void) => () => void
  mbSetCredentials: (credentials: {
    username: string
    password: string
  }) => Promise<IpcResult>
  mbCheckCredentials: () => Promise<
    IpcResult<{ configured: boolean; initialized: boolean }>
  >
  mbClearCredentials: () => Promise<IpcResult>
  openExternal: (url: string) => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AlbumShelfAPI
  }
}