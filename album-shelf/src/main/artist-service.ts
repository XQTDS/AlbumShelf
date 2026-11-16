import Database from 'better-sqlite3'
import { getDatabase } from './database'
import { normalizeRegion, regionLabel } from './region'

/** 写入 artist 表的最小地区信息 */
export interface ArtistRegionInput {
  /** MusicBrainz Artist MBID（唯一键） */
  musicbrainzArtistId: string
  /** MB 艺人规范名 */
  name: string
  sortName?: string | null
  /** MB country（ISO 3166-1 alpha-2） */
  country?: string | null
  /** MB area 名称 */
  area?: string | null
  /** area 的 ISO 3166-1 代码（可选，用于 country 缺失时兜底） */
  isoCodes?: string[] | null
}

export interface ArtistRow {
  id: number
  musicbrainz_artist_id: string
  name: string
  sort_name: string | null
  country: string | null
  area: string | null
  region: string | null
  region_fetched_at: string | null
  created_at: string
  updated_at: string | null
}

/** 地区筛选项（只含至少关联一张专辑的地区） */
export interface RegionOption {
  key: string
  label: string
  count: number
}

/**
 * 艺人资料服务。
 *
 * 当前只负责 MusicBrainz 艺人地区：artist 表以 MBID 为唯一键，
 * 专辑通过 `album.primary_artist_mbid` 引用，地区由查询时 JOIN 得到。
 */
export class ArtistService {
  private db: Database.Database

  constructor() {
    this.db = getDatabase()
  }

  getArtistByMbid(mbid: string): ArtistRow | null {
    const row = this.db
      .prepare('SELECT * FROM artist WHERE musicbrainz_artist_id = ?')
      .get(mbid) as ArtistRow | undefined
    return row ?? null
  }

  /**
   * upsert 艺人地区。
   *
   * - 以 MBID 为唯一键；同一艺人被多张专辑引用时只保留一行。
   * - 新值非空时覆盖旧值（允许 MB 社区后续修正），新值为空时保留旧值。
   * - `region_fetched_at` 表示「已尝试解析」——即使最终没有地区也写入，
   *   避免回填对「MB 确实无地区」的艺人反复查询。
   */
  upsertArtist(input: ArtistRegionInput): ArtistRow {
    const region = normalizeRegion(input.country, input.area, input.isoCodes)
    const fetchedAt = new Date().toISOString()

    this.db
      .prepare(`
        INSERT INTO artist (
          musicbrainz_artist_id, name, sort_name, country, area, region, region_fetched_at
        ) VALUES (
          @musicbrainz_artist_id, @name, @sort_name, @country, @area, @region, @region_fetched_at
        )
        ON CONFLICT(musicbrainz_artist_id) DO UPDATE SET
          name = excluded.name,
          sort_name = COALESCE(excluded.sort_name, artist.sort_name),
          country = COALESCE(excluded.country, artist.country),
          area = COALESCE(excluded.area, artist.area),
          region = COALESCE(excluded.region, artist.region),
          region_fetched_at = COALESCE(excluded.region_fetched_at, artist.region_fetched_at),
          updated_at = datetime('now')
      `)
      .run({
        musicbrainz_artist_id: input.musicbrainzArtistId,
        name: input.name,
        sort_name: input.sortName ?? null,
        country: input.country ?? null,
        area: input.area ?? null,
        region,
        region_fetched_at: fetchedAt
      })

    const row = this.getArtistByMbid(input.musicbrainzArtistId)
    if (!row) {
      throw new Error(`artist upsert 后未能读取记录: ${input.musicbrainzArtistId}`)
    }
    return row
  }

  /**
   * 地区筛选项：只返回至少关联一张专辑的地区，按专辑数降序。
   *
   * 与风格筛选的 `getUsedGenres` 同思路：不列空结果。
   */
  getUsedRegions(): RegionOption[] {
    const rows = this.db
      .prepare(`
        SELECT ar.region AS region, COUNT(DISTINCT a.id) AS count
        FROM artist ar
        INNER JOIN album a ON a.primary_artist_mbid = ar.musicbrainz_artist_id
        WHERE ar.region IS NOT NULL
        GROUP BY ar.region
        ORDER BY count DESC, ar.region
      `)
      .all() as { region: string; count: number }[]

    return rows
      .map((row) => ({
        key: row.region,
        label: regionLabel(row.region) ?? row.region,
        count: row.count
      }))
      .filter((option) => option.key)
  }
}
