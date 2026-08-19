import { ElectronAPI } from '@electron-toolkit/preload'

interface AlbumQueryOptions {
  search?: string
  artist?: string
  genre?: string
  sortBy?: 'mb_rating' | 'release_date' | 'user_rating'
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
  user_rating: number | null
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

/** 网易云专辑热门评论 */
interface NcmComment {
  id: string
  content: string
  likedCount: number
  creator: {
    originalId: number
    nickname: string
    avatarUrl: string | null
  }
  time: number
}

/** 专辑热评返回结构 */
interface AlbumCommentsResult {
  recordCount: number
  comments: NcmComment[]
}

interface SyncResult {
  added: number
  skipped: number
  deleted: number
  total: number
}

interface EnrichProgress {
  current: number
  total: number
  albumTitle: string
  matched: boolean
}

interface EnrichResult {
  matched: number
  failed: number
  confirmed: number
  total: number
}

interface MbFuzzyCandidate {
  mbid: string
  mbTitle: string
  mbArtist: string
  score: number
  releaseDate: string | null
}

interface FuzzyConfirmRequest {
  albumId: number
  albumTitle: string
  albumArtist: string
  candidates: MbFuzzyCandidate[]
}

interface NcmUser {
  userId: number
  nickname: string
  avatarUrl: string | null
}

interface NcmLoginStatus {
  isLoggedIn: boolean
  user: NcmUser | null
}

interface NcmQrcodeResult {
  qrcodeUrl: string
  key: string
}

interface NcmQrcodeCheckResult {
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired'
  user?: NcmUser
}

/** 网易云 API 凭证配置状态 */
interface NcmCredentialStatus {
  configured: boolean
  appId: string | null
}

interface IpcResult<T = void> {
  success: boolean
  data?: T
  error?: string
  loginRequired?: boolean
}

/** 搜索结果中的专辑 */
interface NcmSearchAlbum {
  originalId: number
  id: string
  name: string
  language: string
  coverImgUrl: string | null
  company: string | null
  transName: string | null
  aliaName: string
  genre: string
  artists: { originalId: number; id: string; name: string; coverImgUrl: string | null }[]
  briefDesc: string
  description: string
  publishTime: number
}

/** 添加专辑请求 */
interface AddAlbumRequest {
  netease_album_id: string
  netease_original_id: number
  title: string
  artist: string
  cover_url?: string | null
  /** 搜索结果的 publishTime（北京时间零点时间戳），用于写入发行日期 */
  publish_time?: number | null
}

/** 封面补全进度 */
interface CoverFillProgress {
  current: number
  total: number
  albumTitle: string
  filled: number
}

/** 封面补全结果 */
interface CoverFillResult {
  total: number
  filled: number
  failed: number
}

/** 发行日期回填进度 */
interface ReleaseDateFillProgress {
  current: number
  total: number
  albumTitle: string
  filled: number
}

/** 发行日期回填结果 */
interface ReleaseDateFillResult {
  total: number
  filled: number
  failed: number
}

interface ImportResult {
  albumsAdded: number
  albumsUpdated: number
  tracksImported: number
  genresImported: number
}

interface ExportResult {
  path: string
  albums: number
  tracks: number
}

interface AlbumShelfAPI {
  syncStart: () => Promise<IpcResult<SyncResult>>
  albumRandom: () => Promise<IpcResult<Album>>
  albumList: (options: AlbumQueryOptions) => Promise<IpcResult<AlbumQueryResult>>
  albumFilters: () => Promise<IpcResult<{ artists: string[]; genres: string[] }>>
  trackListByAlbum: (albumId: number) => Promise<IpcResult<Track[]>>
  trackSyncByAlbum: (albumId: number) => Promise<IpcResult<Track[]>>
  albumComments: (albumId: number) => Promise<IpcResult<AlbumCommentsResult>>
  albumFetchCover: (albumId: number, force?: boolean) => Promise<IpcResult<{ cover_url: string | null }>>
  albumCoverFillStatus: () => Promise<
    IpcResult<{ pending: number; running: boolean }>
  >
  albumCoverFillStart: () => Promise<IpcResult<CoverFillResult>>
  onCoverFillProgress: (callback: (progress: CoverFillProgress) => void) => () => void
  albumReleaseDateFillStart: () => Promise<IpcResult<ReleaseDateFillResult>>
  onReleaseDateFillProgress: (callback: (progress: ReleaseDateFillProgress) => void) => () => void
  albumSetRating: (albumId: number, rating: number | null) => Promise<IpcResult>
  genreStats: () => Promise<IpcResult<{
    stats: { name: string; count: number }[]
    totalAlbums: number
    albumsWithGenre: number
  }>>
  setAlbumGenres: (albumId: number, genres: string[]) => Promise<IpcResult>
  albumResync: (albumId: number) => Promise<IpcResult<{
    cover_url: string | null
    tracks_synced: boolean
    enrich_matched: boolean
  }>>
  playerPlayAlbum: (albumId: number) => Promise<IpcResult<{
    playing: string
    totalTracks: number
  }>>
  playerPlaySong: (encryptedId: string, originalId: number) => Promise<IpcResult<void>>
  enrichStatus: () => Promise<
    IpcResult<{ pending: number; enriching: boolean; hasCredentials: boolean }>
  >
  enrichStart: () => Promise<IpcResult<EnrichResult>>
  enrichAlbumsWithoutMbData: () => Promise<IpcResult<EnrichResult>>
  enrichReEnrichAll: () => Promise<IpcResult<EnrichResult>>
  onFuzzyConfirmRequest: (callback: (data: FuzzyConfirmRequest) => void) => () => void
  sendFuzzyConfirmReply: (reply: { mbid: string } | null) => void
  onEnrichProgress: (callback: (progress: EnrichProgress) => void) => () => void
  onMenuReEnrichAll: (callback: () => void) => () => void
  onMenuOpenSettings: (callback: () => void) => () => void
  settingsGetEnrichStrategies: () => Promise<IpcResult<{
    Q1_fullTitleFullArtist: boolean
    Q2_fullTitleFirstArtist: boolean
    Q3_titleFirstWordFirstArtist: boolean
    F1_removeArtistPrefix: boolean
    F2_removeParenSuffix: boolean
    F3_luceneTokenSearch: boolean
  }>>
  settingsSetEnrichStrategies: (strategies: Record<string, boolean>) => Promise<IpcResult>
  ncmGetCredentialStatus: () => Promise<IpcResult<NcmCredentialStatus>>
  mbSetCredentials: (credentials: {
    username: string
    password: string
  }) => Promise<IpcResult>
  mbCheckCredentials: () => Promise<
    IpcResult<{ configured: boolean; initialized: boolean }>
  >
  mbClearCredentials: () => Promise<IpcResult>
  openExternal: (url: string) => Promise<void>

  // 网易云音乐认证
  authGetStatus: () => Promise<IpcResult<NcmLoginStatus>>
  authGenerateQrcode: () => Promise<IpcResult<NcmQrcodeResult>>
  authCheckQrcode: (key: string) => Promise<IpcResult<NcmQrcodeCheckResult>>
  authLogout: () => Promise<IpcResult>
  onAuthStatusChanged: (callback: (status: NcmLoginStatus) => void) => () => void
  onLoginRequired: (callback: () => void) => () => void
  onMenuOpenLogin: (callback: () => void) => () => void
  onMenuSyncAlbums: (callback: () => void) => () => void
  onMenuCoverFill: (callback: () => void) => () => void
  onMenuReleaseDateFill: (callback: () => void) => () => void
  onMenuGenreStats: (callback: () => void) => () => void

  // 在线搜索
  albumSearchOnline: (keyword: string) => Promise<IpcResult<NcmSearchAlbum[]>>
  albumAddToCollection: (album: AddAlbumRequest) => Promise<IpcResult<{ albumId: number }>>
  albumGetCollectedNeteaseIds: () => Promise<IpcResult<{ originalIds: number[], albumIds: string[] }>>

  // 数据导出/导入
  dbExport: () => Promise<IpcResult<ExportResult>>
  dbImport: () => Promise<IpcResult<ImportResult>>
  onMenuDbExport: (callback: () => void) => () => void
  onMenuDbImport: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AlbumShelfAPI
  }
}