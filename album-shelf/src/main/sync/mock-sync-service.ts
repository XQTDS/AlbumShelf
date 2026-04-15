import { SyncService, NeteaseAlbum } from './sync-service'
import { readAlbumsFromCsv, CsvAlbum } from './csv-reader'
import { NcmCliService, NcmCliAlbumSearchResult } from '../ncm-cli-service'

/**
 * 比较两个字符串的相似度（简单的包含匹配）
 * 返回 true 如果名称匹配足够接近
 */
function isNameMatch(searchName: string, resultName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim()
  const a = normalize(searchName)
  const b = normalize(resultName)
  // 完全匹配或互相包含
  return a === b || a.includes(b) || b.includes(a)
}

/**
 * 从搜索结果中找到最匹配的专辑
 * @param results 搜索结果列表
 * @param targetTitle 目标专辑名
 * @param targetArtist 目标艺术家名
 * @returns 匹配的专辑，如果没找到则返回 undefined
 */
function findBestMatch(
  results: NcmCliAlbumSearchResult[],
  targetTitle: string,
  targetArtist: string
): NcmCliAlbumSearchResult | undefined {
  if (results.length === 0) return undefined

  // 尝试找到专辑名和艺术家都匹配的
  for (const result of results) {
    const titleMatch = isNameMatch(targetTitle, result.name)
    const artistMatch = result.artists.some((artist) => isNameMatch(targetArtist, artist.name))

    if (titleMatch && artistMatch) {
      return result
    }
  }

  // 如果没有完全匹配，检查第一个结果的专辑名是否匹配
  if (isNameMatch(targetTitle, results[0].name)) {
    return results[0]
  }

  return undefined
}

/**
 * CsvSyncService - 从 CSV 文件读取专辑数据，通过 ncm-cli 搜索获取真实 ID
 *
 * 从 data/album-collection.csv 读取专辑列表，
 * 对于没有 netease_id 的专辑，通过 ncm-cli search album 获取真实 ID。
 */
export class MockSyncService implements SyncService {
  private ncmCliService: NcmCliService

  constructor(ncmCliService?: NcmCliService) {
    this.ncmCliService = ncmCliService || new NcmCliService()
  }

  async fetchCollectedAlbums(): Promise<NeteaseAlbum[]> {
    // 从 CSV 读取专辑数据
    const csvAlbums = readAlbumsFromCsv()

    console.log(`[CsvSyncService] 从 CSV 读取到 ${csvAlbums.length} 张专辑`)

    // 统计需要搜索的专辑数量
    const albumsNeedSearch = csvAlbums.filter((a) => !a.netease_id)
    console.log(`[CsvSyncService] 其中 ${albumsNeedSearch.length} 张需要搜索获取 ID`)

    // 转换为 NeteaseAlbum 格式，对于没有 ID 的专辑进行搜索
    const results: NeteaseAlbum[] = []
    let searchedCount = 0
    let foundCount = 0

    for (const album of csvAlbums) {
      if (album.netease_id) {
        // 已有 ID，直接使用
        results.push(this.csvToNeteaseAlbum(album, album.netease_id))
      } else {
        // 需要搜索获取 ID
        searchedCount++
        const neteaseId = await this.searchAlbumId(album.title, album.artist)

        if (neteaseId) {
          foundCount++
          results.push(this.csvToNeteaseAlbum(album, neteaseId))
        } else {
          // 搜索失败，跳过此专辑（不添加到结果中）
          console.warn(
            `[CsvSyncService] 未找到专辑: ${album.title} - ${album.artist}`
          )
        }

        // 每搜索 10 张专辑输出一次进度
        if (searchedCount % 10 === 0) {
          console.log(
            `[CsvSyncService] 搜索进度: ${searchedCount}/${albumsNeedSearch.length}, 已找到 ${foundCount}`
          )
        }

        // 添加延迟避免请求过快
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }

    console.log(
      `[CsvSyncService] 搜索完成: 共搜索 ${searchedCount} 张，找到 ${foundCount} 张`
    )
    console.log(`[CsvSyncService] 最终返回 ${results.length} 张专辑`)

    return results
  }

  /**
   * 通过 ncm-cli 搜索专辑，获取真实的网易云专辑 ID
   */
  private async searchAlbumId(title: string, artist: string): Promise<string | undefined> {
    try {
      // 使用"专辑名 艺术家名"作为搜索关键词
      const keyword = `${title} ${artist}`
      const results = await this.ncmCliService.searchAlbum(keyword, 5)

      const match = findBestMatch(results, title, artist)

      if (match) {
        console.log(
          `[CsvSyncService] 找到匹配: "${title}" -> "${match.name}" (ID: ${match.id})`
        )
        return match.id // 返回 32 位 hex ID
      }

      return undefined
    } catch (error) {
      console.error(`[CsvSyncService] 搜索专辑失败: ${title} - ${artist}`, error)
      return undefined
    }
  }

  /**
   * 将 CSV 专辑转换为 NeteaseAlbum 格式
   */
  private csvToNeteaseAlbum(album: CsvAlbum, neteaseId: string): NeteaseAlbum {
    return {
      netease_album_id: neteaseId,
      title: album.title,
      artist: album.artist,
      cover_url: undefined,
      release_date: undefined,
      track_count: undefined
    }
  }

  async checkLoginStatus(): Promise<boolean> {
    // 检查 ncm-cli 是否已登录
    try {
      // 尝试一个简单的搜索来验证是否可用
      await this.ncmCliService.searchAlbum('test', 1)
      return true
    } catch {
      return false
    }
  }
}