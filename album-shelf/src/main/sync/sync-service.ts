/**
 * 网易云音乐专辑数据结构（从同步源获取的原始数据）
 */
export interface NeteaseAlbum {
  /** 网易云音乐加密专辑 ID */
  netease_album_id: string
  /** 网易云音乐原始数字专辑 ID */
  netease_original_id?: number
  /** 专辑名称 */
  title: string
  /** 艺术家名称 */
  artist: string
  /** 封面图片 URL */
  cover_url?: string
  /** 发行日期 (ISO 格式，如 "2020-01-01") */
  release_date?: string
  /** 曲目数量 */
  track_count?: number
}

/**
 * 模糊匹配的专辑信息，需要用户确认
 */
export interface FuzzyMatchAlbum {
  /** CSV 中的原始专辑名 */
  originalTitle: string
  /** 网易云返回的专辑名 */
  matchedTitle: string
  /** 艺术家名 */
  artist: string
  /** 网易云专辑 ID */
  neteaseId: string
  /** 相似度百分比 */
  similarity: number
}

/**
 * 同步结果（包含专辑列表和待确认的模糊匹配）
 */
export interface SyncFetchResult {
  /** 已确认的专辑列表 */
  albums: NeteaseAlbum[]
  /** 需要用户确认的模糊匹配专辑 */
  fuzzyMatches: FuzzyMatchAlbum[]
}

/**
 * SyncService 抽象接口
 *
 * 定义从网易云音乐获取收藏专辑的通用接口。
 * 当前使用 MockSyncService 实现，待 ncm-cli 支持后切换为 NcmCliSyncService。
 */
export interface SyncService {
  /** 获取用户收藏的专辑列表 */
  fetchCollectedAlbums(): Promise<SyncFetchResult>
  /** 检查登录状态 */
  checkLoginStatus(): Promise<boolean>
}
