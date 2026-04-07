import { getMbClient } from './mb-client'
import { AlbumService, Album } from '../album-service'
import type { IReleaseGroupMatch, IRating, ITag } from 'musicbrainz-api'

/**
 * MusicBrainz 匹配结果
 */
export interface MbMatchResult {
  /** MusicBrainz Release Group MBID */
  mbid: string
  /** 匹配分数 (0-100) */
  score: number
  /** 评分 (0-5) */
  rating: number | null
  /** 评分人数 */
  ratingCount: number
  /** 风格标签 */
  tags: string[]
}

/**
 * 补全进度信息
 */
export interface EnrichProgress {
  /** 当前正在处理的序号 (1-based) */
  current: number
  /** 待补全的总数 */
  total: number
  /** 当前正在处理的专辑标题 */
  albumTitle: string
  /** 当前专辑是否匹配成功 */
  matched: boolean
}

/**
 * EnrichService - 数据补全服务
 *
 * 通过 MusicBrainz API 匹配并补全专辑的评分和风格标签。
 */
export class EnrichService {
  private albumService: AlbumService
  private isEnriching = false

  constructor(albumService: AlbumService) {
    this.albumService = albumService
  }

  /**
   * 4.3 专辑匹配逻辑：按专辑名 + 艺术家名搜索 Release Group，取 score 最高结果
   */
  async matchAlbum(title: string, artist: string): Promise<MbMatchResult | null> {
    const mbApi = getMbClient()

    try {
      // 搜索 Release Group
      const searchResult = await mbApi.search('release-group', {
        query: { releasegroup: title, artist: artist },
        limit: 5
      })

      const releaseGroups = searchResult['release-groups']
      if (!releaseGroups || releaseGroups.length === 0) {
        return null
      }

      // 取 score 最高的结果
      const bestMatch = releaseGroups[0] as IReleaseGroupMatch
      if (!bestMatch || bestMatch.score < 50) {
        // Score too low, likely not a good match
        return null
      }

      // 4.4 获取匹配 Release Group 的详细信息（ratings 和 tags）
      const details = await mbApi.lookup('release-group', bestMatch.id, ['ratings', 'tags'])

      const rating = (details as unknown as { rating?: IRating }).rating
      const tags = (details as unknown as { tags?: ITag[] }).tags

      return {
        mbid: bestMatch.id,
        score: bestMatch.score,
        rating: rating?.value ?? null,
        ratingCount: rating?.['votes-count'] ?? 0,
        tags: tags?.map((t) => t.name).filter(Boolean) ?? []
      }
    } catch (error) {
      console.error(`MusicBrainz 匹配失败 [${title} - ${artist}]:`, error)
      return null
    }
  }

  /**
   * 4.4 数据补全逻辑：将匹配结果写入数据库
   */
  async enrichAlbum(album: Album): Promise<boolean> {
    const result = await this.matchAlbum(album.title, album.artist)

    if (!result) {
      // 匹配失败，仍然标记为已尝试补全（设置 enriched_at）
      // 避免重复尝试
      this.albumService.updateAlbum(album.id, {
        enriched_at: new Date().toISOString()
      })
      return false
    }

    // 更新 Album 表
    this.albumService.updateAlbum(album.id, {
      musicbrainz_id: result.mbid,
      mb_rating: result.rating,
      mb_rating_count: result.ratingCount,
      enriched_at: new Date().toISOString()
    })

    // 更新 Genre 关联
    if (result.tags.length > 0) {
      this.albumService.setAlbumGenres(album.id, result.tags)
    }

    return true
  }

  /**
   * 4.5 批量补全流程：对所有未补全的专辑逐个发起匹配
   *
   * @param onProgress 进度回调函数，每处理完一个专辑调用一次
   * @returns 补全结果统计
   */
  async enrichAll(
    onProgress?: (progress: EnrichProgress) => void
  ): Promise<{ matched: number; failed: number; total: number }> {
    if (this.isEnriching) {
      throw new Error('数据补全正在进行中，请勿重复触发。')
    }

    this.isEnriching = true

    try {
      const unenrichedAlbums = this.albumService.getUnenrichedAlbums()
      const total = unenrichedAlbums.length

      if (total === 0) {
        return { matched: 0, failed: 0, total: 0 }
      }

      let matched = 0
      let failed = 0

      for (let i = 0; i < unenrichedAlbums.length; i++) {
        const album = unenrichedAlbums[i]
        const success = await this.enrichAlbum(album)

        if (success) {
          matched++
        } else {
          failed++
        }

        // 进度回调
        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            albumTitle: album.title,
            matched: success
          })
        }
      }

      return { matched, failed, total }
    } finally {
      this.isEnriching = false
    }
  }

  /**
   * 是否正在补全
   */
  get enriching(): boolean {
    return this.isEnriching
  }
}
