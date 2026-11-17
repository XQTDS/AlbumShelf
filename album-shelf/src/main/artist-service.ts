import Database from 'better-sqlite3'
import { getDatabase } from './database'
import { normalizeRegion, normalizeRegionKey, regionLabel } from './region'

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
  /** NULL = 自动/MB 来源；'manual' = 用户手动设置或手动清除，自动补全不得覆盖 */
  region_source: string | null
  region_fetched_at: string | null
  created_at: string
  updated_at: string | null
}

/** 手动设置/清除艺人地区 */
export interface ManualArtistRegionInput {
  neteaseArtistId: number
  name: string
  neteaseEncryptedId?: string | null
  /** null = 清除地区（仍标记 manual，防止自动补全回填） */
  region: string | null
}

/** 地区筛选项（只含至少关联一张专辑的地区） */
export interface RegionOption {
  key: string
  label: string
  count: number
}

/** 地区统计数据 */
export interface RegionStats {
  stats: RegionOption[]
  totalAlbums: number
  albumsWithRegion: number
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
              country = CASE WHEN region_source = 'manual' THEN country ELSE COALESCE(country, ?) END,
              area = CASE WHEN region_source = 'manual' THEN area ELSE COALESCE(area, ?) END,
              region = CASE WHEN region_source = 'manual' THEN region ELSE COALESCE(region, ?) END,
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
        const manualSource = byMbid.region_source === 'manual'
        // 目标 MBID 行是手动地区时，原样继承其值（包括手动清除的 NULL），
        // 不能先用本次自动补全的 country/region 覆盖。
        const country = manualSource ? byMbid.country : (input.country ?? byMbid.country)
        const area = manualSource ? byMbid.area : (input.area ?? byMbid.area)
        const regionValue = manualSource ? byMbid.region : (region ?? byMbid.region)
        const regionSource = manualSource ? 'manual' : null
        const regionFetchedAt = fetchedAt

        this.db
          .prepare(`
            INSERT INTO artist (
              netease_artist_id, netease_encrypted_id, name,
              sort_name, country, area, region, region_source, region_fetched_at
            ) VALUES (
              @netease_artist_id, @netease_encrypted_id, @name,
              @sort_name, @country, @area, @region, @region_source, @region_fetched_at
            )
            ON CONFLICT(netease_artist_id) DO UPDATE SET
              netease_encrypted_id = COALESCE(excluded.netease_encrypted_id, artist.netease_encrypted_id),
              name = excluded.name,
              sort_name = COALESCE(artist.sort_name, excluded.sort_name),
              country = CASE
                WHEN artist.region_source = 'manual' THEN artist.country
                ELSE COALESCE(artist.country, excluded.country)
              END,
              area = CASE
                WHEN artist.region_source = 'manual' THEN artist.area
                ELSE COALESCE(artist.area, excluded.area)
              END,
              region = CASE
                WHEN artist.region_source = 'manual' THEN artist.region
                ELSE COALESCE(artist.region, excluded.region)
              END,
              region_source = CASE
                WHEN artist.region_source = 'manual' THEN 'manual'
                WHEN excluded.region_source = 'manual' THEN 'manual'
                ELSE artist.region_source
              END,
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
            region_source: regionSource,
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
            country = CASE
              WHEN artist.region_source = 'manual' THEN artist.country
              ELSE COALESCE(artist.country, excluded.country)
            END,
            area = CASE
              WHEN artist.region_source = 'manual' THEN artist.area
              ELSE COALESCE(artist.area, excluded.area)
            END,
            region = CASE
              WHEN artist.region_source = 'manual' THEN artist.region
              ELSE COALESCE(artist.region, excluded.region)
            END,
            region_source = CASE
              WHEN artist.region_source = 'manual' THEN 'manual'
              WHEN excluded.region_source = 'manual' THEN 'manual'
              ELSE artist.region_source
            END,
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
   * 手动设置/清除艺人地区（艺人信息窗口的唯一写操作）。
   *
   * - 写入 `region` / `country`，清空 `area`，并标记 `region_source = 'manual'`；
   * - `region = null` 表示手动清除：地区保持为空，自动补全不得回填；
   * - 艺人尚无 artist 行时按网易云 ID 新建（覆盖只在合作位置出现的艺人）；
   * - 无网易云 ID 的身份无法稳定落库，调用方应在 UI 禁用编辑。
   */
  setManualRegion(input: ManualArtistRegionInput): ArtistRow {
    const neteaseArtistId = input.neteaseArtistId
    if (!Number.isInteger(neteaseArtistId) || neteaseArtistId <= 0) {
      throw new Error('无效的网易云艺人 ID')
    }

    const region = input.region == null ? null : normalizeRegionKey(input.region)
    if (input.region != null && region == null) {
      throw new Error('无效的地区代码（应为两位 ISO 3166-1 alpha-2 代码）')
    }

    const name = input.name.trim() || '未知艺人'
    const fetchedAt = new Date().toISOString()

    this.db
      .prepare(`
        INSERT INTO artist (
          netease_artist_id, netease_encrypted_id, name,
          country, area, region, region_source, region_fetched_at, updated_at
        ) VALUES (
          @netease_artist_id, @netease_encrypted_id, @name,
          @country, NULL, @region, 'manual', @region_fetched_at, datetime('now')
        )
        ON CONFLICT(netease_artist_id) DO UPDATE SET
          netease_encrypted_id = COALESCE(excluded.netease_encrypted_id, artist.netease_encrypted_id),
          name = CASE WHEN artist.name IS NULL OR artist.name = '' THEN excluded.name ELSE artist.name END,
          country = excluded.country,
          area = NULL,
          region = excluded.region,
          region_source = 'manual',
          region_fetched_at = COALESCE(artist.region_fetched_at, excluded.region_fetched_at),
          updated_at = datetime('now')
      `)
      .run({
        netease_artist_id: neteaseArtistId,
        netease_encrypted_id: input.neteaseEncryptedId ?? null,
        name,
        country: region,
        region,
        region_fetched_at: fetchedAt
      })

    const row = this.getArtistByNeteaseId(neteaseArtistId)
    if (!row) {
      throw new Error(`artist 手动地区写入后未能读取记录: ${neteaseArtistId}`)
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

  /**
   * 地区统计数据：各地区的专辑数、收藏总数、有地区标签的专辑数。
   *
   * 与风格统计不同，地区是单值：一张专辑最多归属一个地区，因此
   * `stats` 的 count 之和等于 `albumsWithRegion`。
   */
  getRegionStats(): RegionStats {
    // 复用筛选候选：只含至少关联一张专辑的地区，按专辑数降序
    const stats = this.getUsedRegions()

    const { totalAlbums } = this.db
      .prepare('SELECT COUNT(*) AS totalAlbums FROM album')
      .get() as { totalAlbums: number }

    // COUNT(DISTINCT) 防御同一网易云艺人 ID 对应多行 artist 的极端情况
    const { albumsWithRegion } = this.db
      .prepare(`
        SELECT COUNT(DISTINCT a.id) AS albumsWithRegion
        FROM album a
        INNER JOIN artist ar ON ar.netease_artist_id = a.primary_artist_id
        WHERE ar.region IS NOT NULL
      `)
      .get() as { albumsWithRegion: number }

    return { stats, totalAlbums, albumsWithRegion }
  }
}
