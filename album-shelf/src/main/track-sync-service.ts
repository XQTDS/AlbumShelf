import { NcmCliService, NcmCliTrack } from './ncm-cli-service'
import { TrackService, Track, TrackInsert } from './track-service'
import { AlbumService } from './album-service'

/**
 * TrackSyncService - 曲目同步服务
 *
 * 通过 ncm-cli 获取指定专辑的曲目列表，映射为本地 track 表记录，
 * 全量替换写入数据库。
 */
export class TrackSyncService {
  private ncmCliService: NcmCliService
  private trackService: TrackService
  private albumService: AlbumService

  constructor(
    ncmCliService: NcmCliService,
    trackService: TrackService,
    albumService: AlbumService
  ) {
    this.ncmCliService = ncmCliService
    this.trackService = trackService
    this.albumService = albumService
  }

  /**
   * 同步指定专辑的曲目：从 ncm-cli 拉取 → 映射 → 删旧插新 → 更新 track_count
   *
   * @param albumId 本地专辑 ID
   * @param neteaseAlbumId 网易云加密专辑 ID
   * @returns 同步后的曲目列表
   */
  async syncTracksByAlbum(albumId: number, neteaseAlbumId: string): Promise<Track[]> {
    // 1. 从 ncm-cli 拉取曲目
    const ncmTracks = await this.ncmCliService.getAlbumTracks(neteaseAlbumId)

    // 2. 映射为 TrackInsert
    const trackInserts: TrackInsert[] = ncmTracks.map((ncmTrack, index) =>
      this.mapNcmTrack(ncmTrack, albumId, index + 1)
    )

    // 3. 全量替换：先删后插
    this.trackService.deleteTracksByAlbumId(albumId)
    if (trackInserts.length > 0) {
      this.trackService.insertTracks(trackInserts)
    }

    // 4. 更新 album 的 track_count
    this.albumService.updateAlbum(albumId, { track_count: trackInserts.length })

    // 5. 返回最新的曲目列表
    return this.trackService.getTracksByAlbumId(albumId)
  }

  /**
   * 将 ncm-cli 返回的曲目数据映射为 TrackInsert
   */
  private mapNcmTrack(ncmTrack: NcmCliTrack, albumId: number, trackNumber: number): TrackInsert {
    // 合并所有 artist 的 name，用 " / " 连接
    const artistNames = ncmTrack.artists.map((a) => a.name).join(' / ')

    return {
      album_id: albumId,
      netease_song_id: ncmTrack.id,
      netease_original_id: ncmTrack.originalId,
      title: ncmTrack.name,
      artist: artistNames || null,
      track_number: trackNumber,
      disc_number: 1, // ncm-cli 不返回 disc_number，统一设为 1
      duration_ms: ncmTrack.duration
    }
  }
}