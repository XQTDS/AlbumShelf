import { SyncService, NeteaseAlbum, SyncFetchResult, FuzzyMatchAlbum } from './sync-service'
import { readAlbumsFromCsv, CsvAlbum } from './csv-reader'
import { NcmCliService, NcmCliAlbumSearchResult } from '../ncm-cli-service'

/**
 * 标准化字符串用于比较
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    // 统一省略号：将 … (U+2026) 替换为 ...
    .replace(/…/g, '...')
    // 统一全角字符
    .replace(/：/g, ':')
    .replace(/，/g, ',')
    // 移除多余空格
    .replace(/\s+/g, ' ')
}

/**
 * 比较两个字符串的相似度（简单的包含匹配）
 * 返回 true 如果名称匹配足够接近
 */
function isNameMatch(searchName: string, resultName: string): boolean {
  const a = normalize(searchName)
  const b = normalize(resultName)
  // 完全匹配或互相包含
  return a === b || a.includes(b) || b.includes(a)
}

/**
 * 提取字符串中的有效词汇（用于模糊匹配）
 * 过滤掉常见的无意义词和标点
 */
function extractWords(s: string): Set<string> {
  const normalized = normalize(s)
  // 按非字母数字字符分割
  const words = normalized.split(/[^a-z0-9\u4e00-\u9fa5]+/).filter((w) => w.length > 1)
  // 过滤常见的无意义词
  const stopWords = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'in', 'to', 'vol', 'no', 'nos'])
  return new Set(words.filter((w) => !stopWords.has(w)))
}

/**
 * 计算两个字符串的词汇重叠度
 * 返回 0-1 之间的相似度分数
 */
function calculateWordOverlap(a: string, b: string): number {
  const wordsA = extractWords(a)
  const wordsB = extractWords(b)

  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let matchCount = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      matchCount++
    }
  }

  // 使用较小集合作为分母，这样只要小集合的词都出现在大集合中就算高匹配
  const minSize = Math.min(wordsA.size, wordsB.size)
  return matchCount / minSize
}

/** 匹配类型 */
type MatchType = 'exact' | 'fuzzy' | 'none'

/** 匹配结果 */
interface MatchResult {
  type: MatchType
  result?: NcmCliAlbumSearchResult
  similarity?: number
}

/** 模糊匹配阈值 */
const FUZZY_MATCH_THRESHOLD = 0.6

/**
 * 从搜索结果中找到最匹配的专辑
 * @param results 搜索结果列表
 * @param targetTitle 目标专辑名
 * @param targetArtist 目标艺术家名
 * @returns 匹配结果，包含匹配类型和匹配的专辑
 */
function findBestMatch(
  results: NcmCliAlbumSearchResult[],
  targetTitle: string,
  targetArtist: string
): MatchResult {
  if (results.length === 0) return { type: 'none' }

  // 尝试找到专辑名和艺术家都匹配的（精确匹配）
  for (const result of results) {
    const titleMatch = isNameMatch(targetTitle, result.name)
    const artistMatch = result.artists.some((artist) => isNameMatch(targetArtist, artist.name))

    if (titleMatch && artistMatch) {
      return { type: 'exact', result }
    }
  }

  // 如果没有完全匹配，检查第一个结果的专辑名是否匹配
  if (isNameMatch(targetTitle, results[0].name)) {
    return { type: 'exact', result: results[0] }
  }

  // 模糊匹配：如果艺术家匹配，则放宽标题匹配条件
  // 计算标题词汇重叠度，至少要有 60% 的词汇匹配
  for (const result of results) {
    const artistMatch = result.artists.some((artist) => isNameMatch(targetArtist, artist.name))

    if (artistMatch) {
      const titleOverlap = calculateWordOverlap(targetTitle, result.name)
      if (titleOverlap >= FUZZY_MATCH_THRESHOLD) {
        console.log(
          `[CsvSyncService] 模糊匹配: "${targetTitle}" ~ "${result.name}" (相似度: ${(titleOverlap * 100).toFixed(0)}%)`
        )
        return { type: 'fuzzy', result, similarity: titleOverlap }
      }
    }
  }

  return { type: 'none' }
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

  async fetchCollectedAlbums(): Promise<SyncFetchResult> {
    // 从 CSV 读取专辑数据
    const csvAlbums = readAlbumsFromCsv()

    console.log(`[CsvSyncService] 从 CSV 读取到 ${csvAlbums.length} 张专辑`)

    // 统计需要搜索的专辑数量
    const albumsNeedSearch = csvAlbums.filter((a) => !a.netease_id)
    console.log(`[CsvSyncService] 其中 ${albumsNeedSearch.length} 张需要搜索获取 ID`)

    // 转换为 NeteaseAlbum 格式，对于没有 ID 的专辑进行搜索
    const albums: NeteaseAlbum[] = []
    const fuzzyMatches: FuzzyMatchAlbum[] = []
    let searchedCount = 0
    let foundCount = 0

    for (const album of csvAlbums) {
      if (album.netease_id) {
        // 已有 ID，直接使用
        albums.push(this.csvToNeteaseAlbum(album, album.netease_id))
      } else {
        // 需要搜索获取 ID
        searchedCount++
        const searchResult = await this.searchAlbum(album.title, album.artist)

        if (searchResult.type === 'exact' && searchResult.result) {
          foundCount++
          albums.push(this.csvToNeteaseAlbum(album, searchResult.result.id, searchResult.result.originalId))
          console.log(
            `[CsvSyncService] 精确匹配: "${album.title}" -> "${searchResult.result.name}" (ID: ${searchResult.result.id}, originalId: ${searchResult.result.originalId})`
          )
        } else if (searchResult.type === 'fuzzy' && searchResult.result) {
          // 模糊匹配需要用户确认
          fuzzyMatches.push({
            originalTitle: album.title,
            matchedTitle: searchResult.result.name,
            artist: album.artist,
            neteaseId: searchResult.result.id,
            similarity: Math.round((searchResult.similarity || 0) * 100)
          })
          console.log(
            `[CsvSyncService] 待确认模糊匹配: "${album.title}" ~ "${searchResult.result.name}" (${Math.round((searchResult.similarity || 0) * 100)}%)`
          )
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
      `[CsvSyncService] 搜索完成: 共搜索 ${searchedCount} 张，精确匹配 ${foundCount} 张，待确认 ${fuzzyMatches.length} 张`
    )
    console.log(`[CsvSyncService] 最终返回 ${albums.length} 张已确认专辑`)

    return { albums, fuzzyMatches }
  }

  /**
   * 通过 ncm-cli 搜索专辑
   * @returns 匹配结果，包含匹配类型
   */
  private async searchAlbum(title: string, artist: string): Promise<MatchResult> {
    try {
      // 如果有多个艺术家（用"/"分隔），只使用第一个进行搜索
      // 因为网易云搜索使用多个艺术家名反而可能搜索不到
      const searchArtist = artist.includes('/') ? artist.split('/')[0].trim() : artist

      // 使用"专辑名 艺术家名"作为搜索关键词
      const keyword = `${title} ${searchArtist}`
      const results = await this.ncmCliService.searchAlbum(keyword, 5)

      return findBestMatch(results, title, artist)
    } catch (error) {
      console.error(`[CsvSyncService] 搜索专辑失败: ${title} - ${artist}`, error)
      return { type: 'none' }
    }
  }

  /**
   * 将 CSV 专辑转换为 NeteaseAlbum 格式
   */
  private csvToNeteaseAlbum(album: CsvAlbum, neteaseId: string, originalId?: number): NeteaseAlbum {
    return {
      netease_album_id: neteaseId,
      netease_original_id: originalId,
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