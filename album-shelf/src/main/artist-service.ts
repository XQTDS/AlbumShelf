import Database from 'better-sqlite3'
import { getDatabase } from './database'
import { normalizeRegion, regionLabel } from './region'

/** 写入 artist 表的最小地区信息 */
export interface ArtistRegionInput {
  /** 网易云明文主艺人 ID（业务唯一键） */
  neteaseArtistId: number
  /** 网易云加密艺人 ID */
  neteaseEncryptedId?: string | null
  /** 网易云展示名（新建行使用；已有行优先保留） */
  name: string
  /** MusicBrainz Artist MBID（地区来源属性） */
  musicbrainzArtistId: string
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
  netease_artist_id: number | null
  netease_encrypted_id: string | null
  musicbrainz_artist_id: string | null
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
 * 业务唯一键是网易云艺人 ID（`netease_artist_id`）；`musicbrainz_artist_id`
 * 只是地区来源属性。专辑通过 `album.primary_artist_id` 引用，地区由查询时 JOIN 得到。
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

  getArtistByNeteaseId(neteaseArtistId: number): ArtistRow | null {
    const row = this.db
      .prepare('SELECT * FROM artist WHERE netease_artist_id = ?')
      .get(neteaseArtistId) as ArtistRow | undefined
    return row ?? null
  }

  /**
   * 按网易云艺人 ID upsert 地区。
   *
   * 规则：
   * - 一个网易云艺人一行；首次写入的地区优先保留（first-wins），避免同一艺人
   *   在多次补全/多张专辑之间抖动；
   * - 若 MBID 已被另一个网易云行占用（artist.musicbrainz_artist_id 仍是 UNIQUE），
   *   当前行只复制地区字段、不写 MBID；
   * - 若目标 MBID 行是尚未绑定网易云 ID 的历史行，则直接把网易云 ID 挂到该行，
   *   避免产生孤立的 MBID 行；
   * - `region_fetched_at` 记录**首次**写入地区结果的时间（已有值保留），
   *   用作「是否已尝试解析」的标记。
   */
  upsertArtist(input: ArtistRegionInput): ArtistRow {
    const region = normalizeRegion(input.country, input.area, input.isoCodes)
    const fetchedAt = new Date().toISOString()

    const run = this.db.transaction((): ArtistRow => {
      const byNetease = this.getArtistByNeteaseId(input.neteaseArtistId)
      const byMbid = this.getArtistByMbid(input.musicbrainzArtistId)

      // A. 没有网易云行，但目标 MBID 行尚未绑定网易云 ID：复用该行
      if (!byNetease && byMbid && byMbid.netease_artist_id == null) {
        this.db
          .prepare(`
            UPDATE artist SET
              netease_artist_id = ?,
              netease_encrypted_id = COALESCE(?, netease_encrypted_id),
              name = ?,
              sort_name = COALESCE(sort_name, ?),
              country = COALESCE(country, ?),
              area = COALESCE(area, ?),
              region = COALESCE(region, ?),
              region_fetched_at = COALESCE(region_fetched_at, ?),
              updated_at = datetime('now')
            WHERE id = ?
          `)
          .run(
            input.neteaseArtistId,
            input.neteaseEncryptedId ?? null,
            input.name,
            input.sortName ?? null,
            input.country ?? null,
            input.area ?? null,
            region,
            fetchedAt,
            byMbid.id
          )

        const row = this.getArtistByNeteaseId(input.neteaseArtistId)
        if (!row) {
          throw new Error(`artist upsert 后未能读取记录: ${input.neteaseArtistId}`)
        }
        return row
      }

      // B. 目标 MBID 已归属另一行（绑定到其他网易云 ID，或仍是未绑定的历史行）：
      //    本行只复制地区，不写 MBID；未绑定的历史行由下次启动迁移合并。
      if (byMbid && (!byNetease || byMbid.id !== byNetease.id)) {
        const country = input.country ?? byMbid.country
        const area = input.area ?? byMbid.area
        const regionValue = region ?? byMbid.region
        const regionFetchedAt = fetchedAt

        this.db
          .prepare(`
            INSERT INTO artist (
              netease_artist_id, netease_encrypted_id, name,
              sort_name, country, area, region, region_fetched_at
            ) VALUES (
              @netease_artist_id, @netease_encrypted_id, @name,
              @sort_name, @country, @area, @region, @region_fetched_at
            )
            ON CONFLICT(netease_artist_id) DO UPDATE SET
              netease_encrypted_id = COALESCE(excluded.netease_encrypted_id, artist.netease_encrypted_id),
              name = excluded.name,
              sort_name = COALESCE(artist.sort_name, excluded.sort_name),
              country = COALESCE(artist.country, excluded.country),
              area = COALESCE(artist.area, excluded.area),
              region = COALESCE(artist.region, excluded.region),
              region_fetched_at = COALESCE(artist.region_fetched_at, excluded.region_fetched_at),
              updated_at = datetime('now')
          `)
          .run({
            netease_artist_id: input.neteaseArtistId,
            netease_encrypted_id: input.neteaseEncryptedId ?? null,
            name: input.name,
            sort_name: input.sortName ?? byMbid.sort_name,
            country,
            area,
            region: regionValue,
            region_fetched_at: regionFetchedAt
          })

        const row = this.getArtistByNeteaseId(input.neteaseArtistId)
        if (!row) {
          throw new Error(`artist upsert 后未能读取记录: ${input.neteaseArtistId}`)
        }
        return row
      }

      // C. 常规 upsert：按网易云 ID 写入；已有地区/MBID 优先保留
      this.db
        .prepare(`
          INSERT INTO artist (
            netease_artist_id, netease_encrypted_id, musicbrainz_artist_id, name,
            sort_name, country, area, region, region_fetched_at
          ) VALUES (
            @netease_artist_id, @netease_encrypted_id, @musicbrainz_artist_id, @name,
            @sort_name, @country, @area, @region, @region_fetched_at
          )
          ON CONFLICT(netease_artist_id) DO UPDATE SET
            netease_encrypted_id = COALESCE(excluded.netease_encrypted_id, artist.netease_encrypted_id),
            musicbrainz_artist_id = COALESCE(artist.musicbrainz_artist_id, excluded.musicbrainz_artist_id),
            name = excluded.name,
            sort_name = COALESCE(artist.sort_name, excluded.sort_name),
            country = COALESCE(artist.country, excluded.country),
            area = COALESCE(artist.area, excluded.area),
            region = COALESCE(artist.region, excluded.region),
            region_fetched_at = COALESCE(artist.region_fetched_at, excluded.region_fetched_at),
            updated_at = datetime('now')
        `)
        .run({
          netease_artist_id: input.neteaseArtistId,
          netease_encrypted_id: input.neteaseEncryptedId ?? null,
          musicbrainz_artist_id: input.musicbrainzArtistId,
          name: input.name,
          sort_name: input.sortName ?? null,
          country: input.country ?? null,
          area: input.area ?? null,
          region,
          region_fetched_at: fetchedAt
        })

      const row = this.getArtistByNeteaseId(input.neteaseArtistId)
      if (!row) {
        throw new Error(`artist upsert 后未能读取记录: ${input.neteaseArtistId}`)
      }
      return row
    })

    return run()
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
        INNER JOIN album a ON a.primary_artist_id = ar.netease_artist_id
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
