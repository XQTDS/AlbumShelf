import { ElectronAPI } from '@electron-toolkit/preload'

interface AlbumQueryOptions {
  search?: string
  artist?: string
  genres?: string
  followedOnly?: boolean
  artistPartial?: string
  sortBy?: 'mb_rating' | 'release_date' | 'user_rating'
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  fetchAll?: boolean
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
  physical_media: string | null
  /** 艺术家结构化 JSON [{name, originalId, id}]（真源）；NULL = 未回填。artist 文本为其派生展示 */
  artists: string | null
  track_count: number | null
  synced_at: string
  enriched_at: string | null
  created_at: string
  genres?: string[]
}

/** 已关注的艺术家 */
interface FollowedArtist {
  id: number
  name: string
  original_id: number | null
  encrypted_id: string | null
  followed_at: string
  /** 新专辑动态检查的增量水位线；null = 从未检查过 */
  last_checked_at: string | null
  /** 该艺术家在库中的专辑数 */
  album_count: number
}

/**
 * 动态条目分类
 *
 * `own` = 本人名下发行（注意不等于「新作品」：精选集、Remastered、单曲重新上架同样落此类）；
 * `participation` = 参与作品（合辑 / OST / 群星 / 多人合作）。
 */
type ArtistUpdateCategory = 'own' | 'participation'

/** 一条关注艺术家的新专辑动态 */
interface ArtistUpdate {
  id: number
  artist_name: string
  /** 加密专辑 ID，与 album.netease_album_id 同域 */
  album_id: string
  /** 明文专辑 ID，供网易云网页跳转 */
  original_id: number | null
  title: string
  publish_time: number | null
  release_date: string | null
  cover_url: string | null
  category: ArtistUpdateCategory
  /** 曲目数；null = 尚未取到（老数据或 album tracks 失败），UI 需容忍 */
  track_count: number | null
  /** 总时长（毫秒）；null 同上 */
  duration_ms: number | null
  found_at: string
  /** null = 未读 */
  seen_at: string | null
}

/** 动态列表查询结果 */
interface ArtistUpdateListResult {
  items: ArtistUpdate[]
  unreadCount: number
  /** 最近一次成功检查的时间；null = 从未检查过 */
  lastCheckedAt: string | null
  running: boolean
}

/** 检查完成统计 */
interface ArtistUpdateCheckResult {
  /** 关注艺人总数 */
  total: number
  /** 新增的「本人名下发行」条目数 */
  own: number
  /** 新增的「参与作品」条目数 */
  participation: number
  /** 因已在专辑库中而跳过的专辑数 */
  alreadyOwned: number
  /** 因缺加密艺人 ID 而无法检查的艺人数 */
  skippedNoId: number
  /** 检查失败（水位线未推进，下次重跑补齐）的艺人数 */
  failed: number
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
  /** 已存在专辑中被顺带补全缺失网易云跳转 ID 的数量（skipped 的子集） */
  backfilled: number
  deleted: number
  total: number
}

/** 同步进度（fetching 阶段 total 为 null，writing 阶段为专辑总数） */
interface SyncProgress {
  phase: 'fetching' | 'writing'
  current: number
  total: number | null
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
  pending: number
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
  coverUrl: string | null
  pendingCount: number
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

/** 播放器完整状态（ncm-cli state；pause 后 status 也为 'stopped'，需结合 queueLength 判定会话存活） */
interface PlaybackState {
  status: string
  /** 合并串 "歌名 - 艺术家-"；空队列时为 null */
  title: string | null
  /** 当前播放位置（秒） */
  position: number | null
  /** 总时长（秒） */
  duration: number | null
  currentIndex: number
  queueLength: number
}

/** 上一首/下一首命令结果（队列边界时 boundary=true 并携带提示文案） */
interface PlayerStepResult {
  success: boolean
  boundary?: boolean
  message?: string
  error?: string
  loginRequired?: boolean
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
  /** 结构化艺术家列表（真源，与 artist 展示文本同源派生） */
  artists?: { name: string; originalId: number; id: string }[] | null
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

/** 艺术家 ID 回填进度 */
interface ArtistIdFillProgress {
  current: number
  total: number
  albumTitle: string
  filled: number
}

/** 艺术家 ID 回填结果 */
interface ArtistIdFillResult {
  total: number
  filled: number
  failed: number
  /** 回填完成后为缺失 ID 的关注记录补齐的条数 */
  idsMerged: number
}

interface ImportResult {
  albumsAdded: number
  albumsUpdated: number
  tracksImported: number
  genresImported: number
  followedArtistsImported: number
}

interface ExportResult {
  path: string
  albums: number
  tracks: number
}

interface AlbumShelfAPI {
  syncStart: () => Promise<IpcResult<SyncResult>>
  onSyncProgress: (callback: (progress: SyncProgress) => void) => () => void
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
  albumSetPhysicalMedia: (albumId: number, mediaTypes: string[] | null) => Promise<IpcResult>
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
  playerPause: () => Promise<IpcResult>
  playerResume: () => Promise<IpcResult>
  playerNext: () => Promise<PlayerStepResult>
  playerPrev: () => Promise<PlayerStepResult>
  playerSeek: (seconds: number) => Promise<IpcResult>
  playerSetVolume: (level: number) => Promise<IpcResult>
  playerState: () => Promise<IpcResult<PlaybackState | null>>
  playerStop: () => Promise<IpcResult>
  enrichStatus: () => Promise<
    IpcResult<{ pending: number; enriching: boolean; hasCredentials: boolean }>
  >
  enrichStart: () => Promise<IpcResult<EnrichResult>>
  enrichAlbumsWithoutMbData: () => Promise<IpcResult<EnrichResult>>
  enrichReEnrichAll: () => Promise<IpcResult<EnrichResult>>
  onFuzzyConfirmRequest: (callback: (data: FuzzyConfirmRequest) => void) => () => void
  sendFuzzyConfirmReply: (reply: { mbid: string } | null) => void
  onFuzzyResolved: (callback: (data: {
    albumId: number
    albumTitle: string
    confirmed: boolean
  }) => void) => () => void
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
  appGetVersion: () => Promise<string>

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
  onMenuArtistIdFill: (callback: () => void) => () => void
  onMenuGenreStats: (callback: () => void) => () => void
  onMenuOpenAbout: (callback: () => void) => () => void

  // 在线搜索
  albumSearchOnline: (keyword: string) => Promise<IpcResult<NcmSearchAlbum[]>>
  albumAddToCollection: (album: AddAlbumRequest) => Promise<IpcResult<{ albumId: number }>>
  albumGetCollectedNeteaseIds: () => Promise<IpcResult<{ originalIds: number[], albumIds: string[] }>>

  // 关注艺术家
  artistFollow: (name: string, originalId?: number | null, encryptedId?: string | null) => Promise<IpcResult<{ added: boolean }>>
  artistUnfollow: (name: string) => Promise<IpcResult>
  artistListFollowed: () => Promise<IpcResult<FollowedArtist[]>>
  /** 关注状态变更广播（关注/取关后各窗口同步刷新） */
  onFollowedChanged: (callback: () => void) => () => void
  /** 关注列表窗口：请求主窗口按艺术家筛选 */
  artistRequestFilter: (name: string) => void
  /** 主窗口：接收关注列表窗口转发的筛选请求 */
  onArtistFilterRequest: (callback: (name: string) => void) => () => void
  /** 关注列表窗口：关闭自身 */
  followedWindowClose: () => void
  /** 检查关注艺术家的新专辑（严格手动触发；单飞防重入）
   *  @param lookbackDays 回溯天数（30/90/180/365，默认 90）。实际扫描窗口取
   *  `min(now - lookbackDays, 该艺人水位线)`，即至少扫这个范围，水位线更早则扫到水位线 */
  artistUpdatesCheck: (
    lookbackDays?: number
  ) => Promise<IpcResult<ArtistUpdateCheckResult> & { loginRequired?: boolean }>
  /** 动态列表（未读优先 → 本人名下优先 → 发行日期倒序） */
  artistUpdatesList: (unreadOnly?: boolean) => Promise<IpcResult<ArtistUpdateListResult>>
  /** 标记单条动态已读 */
  artistUpdatesMarkRead: (id: number) => Promise<IpcResult<{ changed: boolean }>>
  /** 全部标记已读 */
  artistUpdatesMarkAllRead: () => Promise<IpcResult<{ count: number }>>
  /** 检查进度（当前/总数/艺人名） */
  onArtistUpdatesProgress: (
    callback: (progress: { current: number; total: number; title: string }) => void
  ) => () => void
  /** 动态变更广播（检查完成 / 标记已读 / 取关级联清理后各窗口同步刷新） */
  onArtistUpdatesChanged: (callback: () => void) => () => void

  // 艺术家 ID 批量回填
  albumArtistIdFillStatus: () => Promise<IpcResult<{ pending: number; running: boolean }>>
  albumArtistIdFillStart: () => Promise<IpcResult<ArtistIdFillResult>>
  onArtistIdFillProgress: (callback: (progress: ArtistIdFillProgress) => void) => () => void

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