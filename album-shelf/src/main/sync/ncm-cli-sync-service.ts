import { SyncService, NeteaseAlbum } from './sync-service'

/**
 * NcmCliSyncService - 通过 ncm-cli 获取网易云收藏专辑
 *
 * TODO: ncm-cli 当前版本尚不支持获取用户收藏专辑列表。
 * 待 @music163/ncm-cli 下个版本发布支持后，实现此类。
 * 届时仅需实现 fetchCollectedAlbums 和 checkLoginStatus 方法，
 * 上层同步逻辑无需修改。
 *
 * 参考：
 * - ncm-cli 官方文档：https://developer.music.163.com/st/developer/document?docId=2327e302009c437eb02af48f63d6e514
 * - 相关 skills：ncm-skills/ 目录
 */
export class NcmCliSyncService implements SyncService {
  async fetchCollectedAlbums(): Promise<NeteaseAlbum[]> {
    // TODO: 使用 @music163/ncm-cli 调用收藏专辑列表 API
    // 示例伪代码：
    // const ncm = require('@music163/ncm-cli')
    // const result = await ncm.album.getCollected({ limit: 100, offset: 0 })
    // return result.albums.map(a => ({
    //   netease_album_id: String(a.id),
    //   title: a.name,
    //   artist: a.artist.name,
    //   cover_url: a.picUrl,
    //   release_date: new Date(a.publishTime).toISOString().split('T')[0],
    //   track_count: a.size
    // }))
    throw new Error(
      'NcmCliSyncService 尚未实现：ncm-cli 当前版本不支持获取收藏专辑列表，请使用 MockSyncService。'
    )
  }

  async checkLoginStatus(): Promise<boolean> {
    // TODO: 检查 ncm-cli 的登录状态
    // const ncm = require('@music163/ncm-cli')
    // return await ncm.auth.isLoggedIn()
    throw new Error(
      'NcmCliSyncService 尚未实现：ncm-cli 当前版本不支持获取收藏专辑列表，请使用 MockSyncService。'
    )
  }
}
