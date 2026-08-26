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
  /** 艺术家派生展示文本（多艺术家用 ' / ' 连接，与 artists 同源派生） */
  artist: string
  /** 结构化艺术家列表（真源），artist 文本由其派生 */
  artists?: { name: string; originalId: number; id: string }[]
  /** 封面图片 URL */
  cover_url?: string
  /** 发行日期 (ISO 格式，如 "2020-01-01") */
  release_date?: string
  /** 曲目数量 */
  track_count?: number
}

/**
 * SyncService 抽象接口
 *
 * 定义从网易云音乐获取收藏专辑的通用接口。
 * 由 NcmCliSyncService 实现，通过 ncm-cli album collected 直接拉取收藏列表。
 */
export interface SyncService {
  /**
   * 获取用户收藏的专辑列表
   * @param onProgress 分页拉取进度回调（每拉完一页调用一次，参数为已拉取张数）
   */
  fetchCollectedAlbums(onProgress?: (fetched: number) => void): Promise<NeteaseAlbum[]>
  /** 检查登录状态 */
  checkLoginStatus(): Promise<boolean>
}
