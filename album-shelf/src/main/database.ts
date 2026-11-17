import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { normalizeGenreKey } from './genre-name'
import { parseAlbumArtistsJson } from './album-artist'
import { isLikelySameArtist } from './region'
import { getAliases } from './enrich/artist-alias'

let db: Database.Database | null = null

const CREATE_ALBUM_TABLE = `
CREATE TABLE IF NOT EXISTS album (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  netease_album_id TEXT NOT NULL UNIQUE,
  netease_original_id INTEGER,
  musicbrainz_id TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  artists TEXT,
  cover_url TEXT,
  release_date TEXT,
  mb_rating REAL,
  mb_rating_count INTEGER,
  track_count INTEGER,
  synced_at TEXT NOT NULL,
  enriched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

// 艺人资料表：业务唯一键是网易云艺人 ID（netease_artist_id）。
// MusicBrainz Artist MBID 退化为地区来源属性（仍保留 UNIQUE，供专辑旧外键 primary_artist_mbid 使用）。
// album 通过 primary_artist_id（网易云明文艺人 ID）引用本表，地区由查询时 JOIN 得到。
const CREATE_ARTIST_TABLE = `
CREATE TABLE IF NOT EXISTS artist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  netease_artist_id INTEGER,
  netease_encrypted_id TEXT,
  musicbrainz_artist_id TEXT UNIQUE,
  name TEXT NOT NULL,
  sort_name TEXT,
  country TEXT,
  area TEXT,
  region TEXT,
  region_source TEXT,
  region_fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
`

const CREATE_ARTIST_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_artist_region ON artist(region);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_netease_id ON artist(netease_artist_id);
`

const CREATE_TRACK_TABLE = `
CREATE TABLE IF NOT EXISTS track (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL,
  netease_song_id TEXT,
  netease_original_id INTEGER,
  title TEXT NOT NULL,
  artist TEXT,
  track_number INTEGER NOT NULL,
  disc_number INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (album_id) REFERENCES album(id) ON DELETE CASCADE
);
`

const CREATE_GENRE_TABLE = `
CREATE TABLE IF NOT EXISTS genre (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  mb_genre_id TEXT
);
`

const CREATE_ALBUM_GENRE_TABLE = `
CREATE TABLE IF NOT EXISTS album_genre (
  album_id INTEGER NOT NULL,
  genre_id INTEGER NOT NULL,
  FOREIGN KEY (album_id) REFERENCES album(id) ON DELETE CASCADE,
  FOREIGN KEY (genre_id) REFERENCES genre(id) ON DELETE CASCADE,
  UNIQUE (album_id, genre_id)
);
`

// 关注艺术家（关注粒度 = 拆分后的单个艺术家名；ID 字段可空，供后续按 artistId 查询网易云数据）
const CREATE_FOLLOWED_ARTIST_TABLE = `
CREATE TABLE IF NOT EXISTS followed_artist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  original_id INTEGER,
  encrypted_id TEXT,
  followed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

// 关注艺术家的新专辑动态条目。
//
// 独立于 album 表：手动同步会删除「不在网易云收藏列表」的本地专辑
// （sync-manager.ts），动态条目若写进 album 会被下次同步整片删掉。
// 因此动态流自成一张表，未入库条目封面走远程直链（不进 cover:// 缓存）。
//
// album_id 是加密专辑 ID，与 album.netease_album_id 同域，可直接比对判断「已入库」；
// original_id 是明文 ID，仅供网易云网页跳转（来自 album get，几乎不会为空）。
const CREATE_ARTIST_UPDATE_TABLE = `
CREATE TABLE IF NOT EXISTS artist_update (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_name TEXT NOT NULL,
  album_id TEXT NOT NULL,
  original_id INTEGER,
  title TEXT NOT NULL,
  publish_time INTEGER,
  release_date TEXT,
  cover_url TEXT,
  category TEXT NOT NULL,
  track_count INTEGER,
  duration_ms INTEGER,
  found_at TEXT NOT NULL DEFAULT (datetime('now')),
  seen_at TEXT,
  UNIQUE (artist_name, album_id)
);
`

const CREATE_ARTIST_UPDATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_artist_update_seen ON artist_update(seen_at);
CREATE INDEX IF NOT EXISTS idx_artist_update_found ON artist_update(found_at DESC);
`

interface DbArtistRow {
  id: number
  netease_artist_id: number | null
  netease_encrypted_id: string | null
  musicbrainz_artist_id: string | null
  name: string
  sort_name: string | null
  country: string | null
  area: string | null
  region: string | null
  region_source: string | null
  region_fetched_at: string | null
  created_at: string
  updated_at: string | null
}

/**
 * 旧库的 artist 表把 musicbrainz_artist_id 定义为 NOT NULL。
 * 新的网易云键模型需要允许「无 MB 数据」的网易云-only 行，因此重建该表：
 * 保留所有旧行与 id，只把 MBID 约束放宽为可空（仍保持 UNIQUE）。
 *
 * 重建在 foreign_keys=OFF 下进行；album.primary_artist_mbid 的外键按表名
 * 解析，重命名后自动指向新表（新表仍有 MBID 的 UNIQUE 约束）。
 */
function rebuildArtistTable(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info('artist')").all() as {
    name: string
    notnull: number
  }[]
  const mbidColumn = columns.find((c) => c.name === 'musicbrainz_artist_id')
  if (!mbidColumn || mbidColumn.notnull === 0) return

  const hasRegionSource = columns.some((c) => c.name === 'region_source')

  db.pragma('foreign_keys = OFF')
  try {
    const rebuild = db.transaction(() => {
      db.exec(`
        CREATE TABLE artist_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          netease_artist_id INTEGER,
          netease_encrypted_id TEXT,
          musicbrainz_artist_id TEXT UNIQUE,
          name TEXT NOT NULL,
          sort_name TEXT,
          country TEXT,
          area TEXT,
          region TEXT,
          region_source TEXT,
          region_fetched_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT
        )
      `)
      db.exec(`
        INSERT INTO artist_new (
          id, musicbrainz_artist_id, name, sort_name, country, area, region,
          region_source, region_fetched_at, created_at, updated_at
        )
        SELECT id, musicbrainz_artist_id, name, sort_name, country, area, region,
               ${hasRegionSource ? 'region_source' : 'NULL'}, region_fetched_at,
               created_at, updated_at
        FROM artist
      `)
      db.exec('DROP TABLE artist')
      db.exec('ALTER TABLE artist_new RENAME TO artist')
    })
    rebuild()
  } finally {
    db.pragma('foreign_keys = ON')
  }
  console.log(
    '[Database] artist 表已重建：musicbrainz_artist_id 允许为空，新增网易云艺人键'
  )
}

/**
 * 把 artist 表的业务键迁移到网易云艺人 ID。
 *
 * - 解析每张专辑 `artists[0].originalId`（网易云明文主艺人 ID）；
 * - 按该 ID 分组，选出主 MBID：优先有地区，其次组内专辑数最多，最后按 MBID 字典序；
 * - 复用旧 MBID 行：若主 MBID 行尚无网易云 ID，直接把网易云 ID 挂到该行；
 * - 同一 MBID 已被另一个网易云行占用时，只把地区字段复制到当前行
 *   （`musicbrainz_artist_id` 保持 NULL，避免 UNIQUE 冲突）；
 * - 为所有网易云主艺人 ID 确保存在 artist 行；
 * - 回填 `album.primary_artist_id`。
 *
 * 幂等：已存在的行/值不会重复写；无变化时零写入。
 */
function ensureNeteaseArtistIdentity(db: Database.Database): void {
  const albums = db
    .prepare(`
      SELECT id, artist, artists, primary_artist_mbid
      FROM album
    `)
    .all() as {
    id: number
    artist: string
    artists: string | null
    primary_artist_mbid: string | null
  }[]

  interface Group {
    encryptedId: string | null
    name: string
    /** 网易云侧候选名：主艺人名、专辑展示文本、以及别名文件里的 MB 名 */
    names: Set<string>
    albums: {
      id: number
      mbid: string | null
    }[]
  }

  const groups = new Map<number, Group>()
  for (const album of albums) {
    const primary = parseAlbumArtistsJson(album.artists)?.[0]
    if (!primary || primary.originalId == null) continue

    let group = groups.get(primary.originalId)
    if (!group) {
      group = {
        encryptedId: primary.id,
        name: primary.name,
        names: new Set([primary.name, ...getAliases(primary.name)]),
        albums: []
      }
      groups.set(primary.originalId, group)
    } else {
      if (!group.encryptedId && primary.id) group.encryptedId = primary.id
      if (!group.name && primary.name) group.name = primary.name
    }
    // 别名文件的 key 可能是专辑展示全串（如 "A / B"），把其别名纳入网易云侧候选名；
    // 不直接加入展示全串本身，避免 "A / B" 归一化成 "ab" 后误命中其他 MB 艺人。
    for (const alias of getAliases(album.artist)) group.names.add(alias)
    group.albums.push({
      id: album.id,
      mbid: album.primary_artist_mbid
    })
  }

  const getByNetease = db.prepare('SELECT * FROM artist WHERE netease_artist_id = ?')
  const getByMbid = db.prepare('SELECT * FROM artist WHERE musicbrainz_artist_id = ?')

  const insertNeteaseOnly = db.prepare(`
    INSERT INTO artist (netease_artist_id, netease_encrypted_id, name)
    VALUES (?, ?, ?)
    ON CONFLICT(netease_artist_id) DO NOTHING
  `)

  // 把网易云身份挂到已有 MBID 行（该行已持有 MBID 与地区）
  const attachToMbidRow = db.prepare(`
    UPDATE artist SET
      netease_artist_id = ?,
      netease_encrypted_id = COALESCE(netease_encrypted_id, ?),
      name = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `)

  // 网易云-only 行合并进 MB 行：地区字段由调用方按 manual 优先级算好后整体写入，
  // 避免 SQL 里的 COALESCE 把手动地区（含手动清除的 NULL）覆盖回 MB 值。
  const mergeNeteaseIntoMbid = db.prepare(`
    UPDATE artist SET
      sort_name = COALESCE(sort_name, ?),
      country = ?,
      area = ?,
      region = ?,
      region_source = ?,
      region_fetched_at = COALESCE(region_fetched_at, ?),
      updated_at = datetime('now')
    WHERE id = ?
  `)
  const deleteNeteaseRow = db.prepare('DELETE FROM artist WHERE id = ?')

  // 行已持有 MBID：只补地区/名称等缺失字段
  const fillRegion = db.prepare(`
    UPDATE artist SET
      netease_encrypted_id = COALESCE(netease_encrypted_id, ?),
      name = CASE WHEN name IS NULL OR name = '' THEN ? ELSE name END,
      sort_name = COALESCE(sort_name, ?),
      country = COALESCE(country, ?),
      area = COALESCE(area, ?),
      region = COALESCE(region, ?),
      region_fetched_at = COALESCE(region_fetched_at, ?),
      region_source = COALESCE(region_source, ?),
      updated_at = datetime('now')
    WHERE id = ?
  `)

  // 手动地区的行：只补非地区字段，地区/国家/area 一律不动
  const fillNonRegion = db.prepare(`
    UPDATE artist SET
      netease_encrypted_id = COALESCE(netease_encrypted_id, ?),
      name = CASE WHEN name IS NULL OR name = '' THEN ? ELSE name END,
      sort_name = COALESCE(sort_name, ?),
      updated_at = datetime('now')
    WHERE id = ?
  `)

  // 有 MBID 但 artist 表里没有对应行：先把 MBID 挂上，地区留给后续补全
  const attachMbidOnly = db.prepare(`
    UPDATE artist SET
      musicbrainz_artist_id = ?,
      netease_encrypted_id = COALESCE(netease_encrypted_id, ?),
      name = CASE WHEN name IS NULL OR name = '' THEN ? ELSE name END,
      updated_at = datetime('now')
    WHERE id = ?
  `)

  const setAlbumPrimary = db.prepare(`
    UPDATE album SET primary_artist_id = ?
    WHERE id = ? AND (primary_artist_id IS NULL OR primary_artist_id <> ?)
  `)

  let created = 0
  let attached = 0
  let merged = 0
  let copied = 0
  let albumUpdates = 0

  const run = db.transaction(() => {
    const ordered = [...groups.entries()].sort((a, b) => a[0] - b[0])

    for (const [neteaseArtistId, group] of ordered) {
      // 主 MBID：优先有地区 → 专辑数最多 → MBID 字典序
      const counts = new Map<string, number>()
      for (const album of group.albums) {
        if (album.mbid) counts.set(album.mbid, (counts.get(album.mbid) ?? 0) + 1)
      }
      const candidates = [...counts.entries()].map(([mbid, count]) => ({
        mbid,
        count,
        row: getByMbid.get(mbid) as DbArtistRow | undefined
      }))
      // 只有 MB 艺人与网易云主艺人可确认为同一实体时才把地区挂到共享行；
      // 别名文件是「网易云名 → MB 名」，因此别名应作为网易云侧的补充名，
      // 与候选 MB 名比较（而不是拼进 MB 名列表）。
      const neteaseNames = [...group.names]
      const matchedCandidates = candidates.filter((c) =>
        neteaseNames.some((name) =>
          isLikelySameArtist(name, [c.row?.name, c.row?.sort_name])
        )
      )
      const withRegion = matchedCandidates.filter((c) => c.row?.region)
      const pool = withRegion.length > 0 ? withRegion : matchedCandidates
      pool.sort((a, b) => b.count - a.count || a.mbid.localeCompare(b.mbid))
      const chosen = pool[0]?.mbid ?? null
      const chosenRow = pool[0]?.row ?? null

      let row = getByNetease.get(neteaseArtistId) as DbArtistRow | undefined

      // 网易云行已存在但尚无 MBID，选中的 MBID 行又未绑定网易云 ID：
      // 先把网易云行的缺失字段合并进 MB 行，再删除网易云行并把 ID 挂到 MB 行。
      // 网易云行没有 MBID，album.primary_artist_id 也不是外键，删除安全。
      if (
        row &&
        !row.musicbrainz_artist_id &&
        chosenRow &&
        chosenRow.netease_artist_id == null &&
        chosenRow.id !== row.id
      ) {
        // 地区字段按 manual 优先级合并：目标行 manual 最优先；否则源行 manual；
        // 否则沿用 MB 行的现值，缺失时才用网易云行补。手动清除（NULL + manual）
        // 也必须保留，不能被 MB 行的地区覆盖。
        const targetManual = chosenRow.region_source === 'manual'
        const sourceManual = row.region_source === 'manual'
        const mergedCountry = targetManual
          ? chosenRow.country
          : sourceManual
            ? row.country
            : (chosenRow.country ?? row.country)
        const mergedArea = targetManual
          ? chosenRow.area
          : sourceManual
            ? row.area
            : (chosenRow.area ?? row.area)
        const mergedRegion = targetManual
          ? chosenRow.region
          : sourceManual
            ? row.region
            : (chosenRow.region ?? row.region)
        const mergedRegionSource =
          targetManual || sourceManual
            ? 'manual'
            : (chosenRow.region_source ?? row.region_source)

        mergeNeteaseIntoMbid.run(
          row.sort_name,
          mergedCountry,
          mergedArea,
          mergedRegion,
          mergedRegionSource,
          chosenRow.region_fetched_at ?? row.region_fetched_at,
          chosenRow.id
        )
        deleteNeteaseRow.run(row.id)
        attachToMbidRow.run(
          neteaseArtistId,
          group.encryptedId ?? row.netease_encrypted_id,
          group.name || chosenRow.name,
          chosenRow.id
        )
        row = getByNetease.get(neteaseArtistId) as DbArtistRow | undefined
        merged++
      }

      // 旧 MBID 行尚未绑定网易云 ID：直接复用该行，避免产生孤立的 MBID 行
      if (!row && chosenRow && chosenRow.netease_artist_id == null) {
        attachToMbidRow.run(
          neteaseArtistId,
          group.encryptedId,
          group.name || chosenRow.name,
          chosenRow.id
        )
        row = getByNetease.get(neteaseArtistId) as DbArtistRow | undefined
        attached++
      }

      if (!row) {
        insertNeteaseOnly.run(
          neteaseArtistId,
          group.encryptedId,
          group.name || '未知艺人'
        )
        row = getByNetease.get(neteaseArtistId) as DbArtistRow | undefined
        created++
      }

      if (row) {
        if (chosenRow) {
          const isManual = row.region_source === 'manual'
          const copiesRegion =
            !isManual &&
            ((!row.region && !!chosenRow.region) ||
              (!row.country && !!chosenRow.country) ||
              (!row.area && !!chosenRow.area))

          const canFillOther =
            (!row.sort_name && !!chosenRow.sort_name) ||
            (!row.netease_encrypted_id && !!group.encryptedId)

          if (isManual) {
            // 手动地区行：只补名称/加密 ID/sort_name，绝不碰地区字段
            if (canFillOther) {
              fillNonRegion.run(
                group.encryptedId,
                group.name || row.name,
                chosenRow.sort_name,
                row.id
              )
            }
          } else if (copiesRegion || canFillOther) {
            fillRegion.run(
              group.encryptedId,
              group.name || row.name,
              chosenRow.sort_name,
              chosenRow.country,
              chosenRow.area,
              chosenRow.region,
              chosenRow.region_fetched_at,
              chosenRow.region_source === 'manual' && !!chosenRow.region && !row.region
                ? 'manual'
                : null,
              row.id
            )
            if (row.id !== chosenRow.id && copiesRegion) copied++
          }
        } else if (chosen && !row.musicbrainz_artist_id) {
          // artist 表里没有该 MBID 的行：先挂 MBID，地区由后续补全填充
          attachMbidOnly.run(
            chosen,
            group.encryptedId,
            group.name || row.name,
            row.id
          )
        }
      }

      for (const album of group.albums) {
        albumUpdates += setAlbumPrimary.run(
          neteaseArtistId,
          album.id,
          neteaseArtistId
        ).changes
      }
    }
  })

  run()

  if (created > 0 || attached > 0 || merged > 0 || copied > 0 || albumUpdates > 0) {
    console.log(
      `[Database] 网易云艺人键迁移：新增 ${created} 行，复用 ${attached} 行，合并 ${merged} 行，复制地区 ${copied} 行，更新专辑 ${albumUpdates} 张`
    )
  }
  if (copied > 0) {
    console.warn(
      `[Database] ${copied} 个网易云艺人共享已有 MBID：已复制地区，MBID 仍归属首个网易云行`
    )
  }
}

export function initDatabase(): Database.Database {
  if (db) {
    return db
  }

  const dbPath = join(app.getPath('userData'), 'album-shelf.db')

  db = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL')
  // Enable foreign keys
  db.pragma('foreign_keys = ON')

  // Create tables
  db.exec(CREATE_ALBUM_TABLE)
  // artist 表必须在 album 的 primary_artist_mbid 迁移之前创建（外键目标）
  db.exec(CREATE_ARTIST_TABLE)
  // 旧库的 artist.musicbrainz_artist_id 为 NOT NULL；重建以允许网易云-only 行
  rebuildArtistTable(db)
  // 兼容已重建但缺少新列的库（正常新库由 CREATE_ARTIST_TABLE 建好）
  const artistColumns = db
    .prepare("PRAGMA table_info('artist')")
    .all() as { name: string }[]
  if (!artistColumns.some((c) => c.name === 'netease_artist_id')) {
    db.exec('ALTER TABLE artist ADD COLUMN netease_artist_id INTEGER')
  }
  if (!artistColumns.some((c) => c.name === 'netease_encrypted_id')) {
    db.exec('ALTER TABLE artist ADD COLUMN netease_encrypted_id TEXT')
  }
  // region_source：NULL = 自动/MB 来源；'manual' = 用户手动设置/清除。
  // 手动值 SHALL NOT 被自动补全覆盖（见 artist-service.ts / ensureNeteaseArtistIdentity）。
  if (!artistColumns.some((c) => c.name === 'region_source')) {
    db.exec('ALTER TABLE artist ADD COLUMN region_source TEXT')
  }
  db.exec(CREATE_ARTIST_INDEXES)
  db.exec(CREATE_TRACK_TABLE)
  db.exec(CREATE_GENRE_TABLE)
  db.exec(CREATE_ALBUM_GENRE_TABLE)
  db.exec(CREATE_FOLLOWED_ARTIST_TABLE)
  db.exec(CREATE_ARTIST_UPDATE_TABLE)
  db.exec(CREATE_ARTIST_UPDATE_INDEXES)

  // Migration: album table
  const albumColumns = db
    .prepare("PRAGMA table_info('album')")
    .all() as { name: string }[]
  // Rename netease_id → netease_album_id
  if (albumColumns.some((c) => c.name === 'netease_id')) {
    db.exec('ALTER TABLE album RENAME COLUMN netease_id TO netease_album_id')
  }
  // Add netease_original_id if missing
  if (!albumColumns.some((c) => c.name === 'netease_original_id')) {
    db.exec('ALTER TABLE album ADD COLUMN netease_original_id INTEGER')
  }
  // Add user_rating if missing
  if (!albumColumns.some((c) => c.name === 'user_rating')) {
    db.exec('ALTER TABLE album ADD COLUMN user_rating REAL')
  }
  // Add physical_media if missing (实体介质标记：vinyl/cd/cassette，逗号分隔，可空)
  if (!albumColumns.some((c) => c.name === 'physical_media')) {
    db.exec('ALTER TABLE album ADD COLUMN physical_media TEXT')
  }
  // Add artists if missing (结构化艺术家 JSON [{name, originalId, id}]，NULL = 未回填；真源，artist 文本为其派生展示)
  if (!albumColumns.some((c) => c.name === 'artists')) {
    db.exec('ALTER TABLE album ADD COLUMN artists TEXT')
  }
  // Add external_links if missing (外部站点链接 JSON，如 {"discogs":"https://www.discogs.com/master/21491"}。
  // NULL = 未回填（详情面板打开时惰性查询），'{}' = 已查询过但无任何白名单链接 —— 两者必须区分，
  // 否则「确实没有链接」的专辑每次打开面板都会重查一遍，见 external-links.ts)
  if (!albumColumns.some((c) => c.name === 'external_links')) {
    db.exec('ALTER TABLE album ADD COLUMN external_links TEXT')
  }
  // Add primary_artist_mbid if missing（主艺人 MBID；地区由 artist 表 JOIN 得到，不在 album 冗余存储。
  // 引用 artist.musicbrainz_artist_id（UNIQUE）；ADD COLUMN 默认 NULL，满足 SQLite 外键迁移要求）
  if (!albumColumns.some((c) => c.name === 'primary_artist_mbid')) {
    db.exec(
      'ALTER TABLE album ADD COLUMN primary_artist_mbid TEXT REFERENCES artist(musicbrainz_artist_id)'
    )
  }
  // Add region_checked_at if missing（地区补全水位线：NULL = 尚未尝试；
  // 成功解析（含「MB 无艺人地区」）后写入；查询失败保持 NULL 以便重试）
  if (!albumColumns.some((c) => c.name === 'region_checked_at')) {
    db.exec('ALTER TABLE album ADD COLUMN region_checked_at TEXT')
  }
  // Add primary_artist_id if missing（网易云明文主艺人 ID，地区 JOIN 的业务键。
  // 不声明外键：artist 行可能在专辑之后由迁移/补全创建，LEFT JOIN 缺行时地区为空）
  if (!albumColumns.some((c) => c.name === 'primary_artist_id')) {
    db.exec('ALTER TABLE album ADD COLUMN primary_artist_id INTEGER')
  }
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_album_primary_artist_mbid ON album(primary_artist_mbid)'
  )
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_album_primary_artist_id ON album(primary_artist_id)'
  )
  // Drop artist_ids if present (从未随版本发布的冗余列；best-effort，失败仅告警，保留无害)
  if (albumColumns.some((c) => c.name === 'artist_ids')) {
    try {
      db.exec('ALTER TABLE album DROP COLUMN artist_ids')
    } catch (error) {
      console.warn('[Database] 删除冗余列 artist_ids 失败（保留无害）:', error)
    }
  }

  // Migration: track table
  const trackColumns = db
    .prepare("PRAGMA table_info('track')")
    .all() as { name: string }[]
  // Rename netease_id → netease_song_id
  if (trackColumns.some((c) => c.name === 'netease_id')) {
    db.exec('ALTER TABLE track RENAME COLUMN netease_id TO netease_song_id')
  }
  // Add netease_original_id if missing
  if (!trackColumns.some((c) => c.name === 'netease_original_id')) {
    db.exec('ALTER TABLE track ADD COLUMN netease_original_id INTEGER')
  }

  // Migration: genre table
  const genreColumns = db
    .prepare("PRAGMA table_info('genre')")
    .all() as { name: string }[]
  // Add mb_genre_id if missing（MusicBrainz 风格 UUID；来源标记，NULL = 非 MB 同步而来，
  // 如历史手动标签或补全流程自动建档。风格库同步只补空值，不改 name/id，见 genre-library-service.ts）
  if (!genreColumns.some((c) => c.name === 'mb_genre_id')) {
    db.exec('ALTER TABLE genre ADD COLUMN mb_genre_id TEXT')
  }

  // Migration: followed_artist table
  const followedArtistColumns = db
    .prepare("PRAGMA table_info('followed_artist')")
    .all() as { name: string }[]
  // Add last_checked_at if missing（新专辑动态检查的增量水位线；NULL = 从未检查过，
  // 首次检查回溯 90 天基线。仅在该艺人检查成功时推进，失败不推进以免永久漏检）
  if (!followedArtistColumns.some((c) => c.name === 'last_checked_at')) {
    db.exec('ALTER TABLE followed_artist ADD COLUMN last_checked_at TEXT')
  }

  // Migration: artist_update table
  const artistUpdateColumns = db
    .prepare("PRAGMA table_info('artist_update')")
    .all() as { name: string }[]
  // Add track_count / duration_ms if missing（曲目数与总时长，用于区分单曲与正式专辑）。
  // 已有行为 NULL，下次检查时由「补拉 tracks 并 UPDATE」的自愈路径填上，无需手动清库
  if (!artistUpdateColumns.some((c) => c.name === 'track_count')) {
    db.exec('ALTER TABLE artist_update ADD COLUMN track_count INTEGER')
  }
  if (!artistUpdateColumns.some((c) => c.name === 'duration_ms')) {
    db.exec('ALTER TABLE artist_update ADD COLUMN duration_ms INTEGER')
  }

  // Data migration: 合并历史重复风格行（同名 = 归一化后同名，见 genre-name.ts）
  mergeDuplicateGenres(db)

  // Data migration: artist 业务键迁移到网易云艺人 ID，并回填 album.primary_artist_id
  ensureNeteaseArtistIdentity(db)

  return db
}

interface GenreRow {
  id: number
  name: string
  mb_genre_id: string | null
}

/**
 * 一次性合并历史重复风格行（幂等）。
 *
 * 背景：风格库同步（大小写不敏感去重）与专辑写入（历史上的精确匹配 INSERT OR IGNORE）
 * 口径不一致，导致同名风格可能存在多行 —— 例如 `Impressionism`（带 MB UUID，无专辑）
 * 与 `impressionism`（无 UUID，挂着专辑）；`choral symphony` 与带换行符的
 * `choral symphony\n`。写入路径已修（album-service.ts 的 setAlbumGenres），此处清理存量。
 *
 * 规则：同组胜者优先「持有 mb_genre_id」的行，并列取最小 id；败者的专辑关联改指胜者后
 * 删除该行。全程单事务，不丢任何专辑↔风格关联；无重复时零写入。
 */
function mergeDuplicateGenres(db: Database.Database): void {
  const rows = db
    .prepare('SELECT id, name, mb_genre_id FROM genre ORDER BY id')
    .all() as GenreRow[]

  const groups = new Map<string, GenreRow[]>()
  for (const row of rows) {
    const key = normalizeGenreKey(row.name)
    const list = groups.get(key)
    if (list) {
      list.push(row)
    } else {
      groups.set(key, [row])
    }
  }

  const repoint = db.prepare(
    `INSERT OR IGNORE INTO album_genre (album_id, genre_id)
     SELECT album_id, ? FROM album_genre WHERE genre_id = ?`
  )
  const unlink = db.prepare('DELETE FROM album_genre WHERE genre_id = ?')
  const removeGenre = db.prepare('DELETE FROM genre WHERE id = ?')

  const merge = db.transaction(() => {
    let mergedGroups = 0
    let deletedRows = 0

    for (const group of groups.values()) {
      if (group.length < 2) continue

      const winner = group.find((r) => r.mb_genre_id) ?? group.reduce((a, b) => (a.id <= b.id ? a : b))

      for (const loser of group) {
        if (loser.id === winner.id) continue
        repoint.run(winner.id, loser.id)
        unlink.run(loser.id)
        removeGenre.run(loser.id)
        deletedRows++
      }
      mergedGroups++
    }

    return { mergedGroups, deletedRows }
  })

  const { mergedGroups, deletedRows } = merge()
  if (mergedGroups > 0) {
    console.log(`[Database] 合并重复风格 ${mergedGroups} 组，删除 ${deletedRows} 行孤儿风格`)
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export interface ExportData {
  version: 5
  exportedAt: string
  data: {
    albums: Record<string, unknown>[]
    tracks: Record<string, unknown>[]
    genres: Record<string, unknown>[]
    albumGenres: Record<string, unknown>[]
    followedArtists: Record<string, unknown>[]
    artists: Record<string, unknown>[]
  }
}

export function exportDatabase(): ExportData {
  const database = getDatabase()
  return {
    version: 5,
    exportedAt: new Date().toISOString(),
    data: {
      albums: database.prepare('SELECT * FROM album').all() as Record<string, unknown>[],
      tracks: database.prepare('SELECT * FROM track').all() as Record<string, unknown>[],
      genres: database.prepare('SELECT * FROM genre').all() as Record<string, unknown>[],
      albumGenres: database.prepare('SELECT * FROM album_genre').all() as Record<string, unknown>[],
      followedArtists: database.prepare('SELECT * FROM followed_artist').all() as Record<string, unknown>[],
      artists: database.prepare('SELECT * FROM artist').all() as Record<string, unknown>[]
    }
  }
}

export interface ImportResult {
  albumsAdded: number
  albumsUpdated: number
  tracksImported: number
  genresImported: number
  followedArtistsImported: number
  artistsImported: number
}

/** 导入文件可接受的版本（v5 = 当前格式；v1-v4 = 历史格式） */
export type ImportData = Omit<ExportData, 'version'> & { version: 1 | 2 | 3 | 4 | 5 }

export function importDatabase(data: ImportData): ImportResult {
  const database = getDatabase()

  if (
    data.version !== 1 &&
    data.version !== 2 &&
    data.version !== 3 &&
    data.version !== 4 &&
    data.version !== 5
  ) {
    throw new Error(`不支持的导出版本: ${data.version}`)
  }

  const result: ImportResult = {
    albumsAdded: 0,
    albumsUpdated: 0,
    tracksImported: 0,
    genresImported: 0,
    followedArtistsImported: 0,
    artistsImported: 0
  }

  const importTx = database.transaction(() => {
    // 0. Import artists（v5/v4 优先按网易云 ID；v3/历史行按 MBID；两者都没有则跳过）
    //    必须在 album 之前导入：album.primary_artist_mbid 引用 artist.musicbrainz_artist_id。
    const artists = data.data.artists ?? []
    const upsertByNetease = database.prepare(`
      INSERT INTO artist (
        netease_artist_id, netease_encrypted_id, musicbrainz_artist_id, name,
        sort_name, country, area, region, region_source, region_fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(netease_artist_id) DO UPDATE SET
        netease_encrypted_id = COALESCE(excluded.netease_encrypted_id, artist.netease_encrypted_id),
        musicbrainz_artist_id = COALESCE(artist.musicbrainz_artist_id, excluded.musicbrainz_artist_id),
        name = excluded.name,
        sort_name = COALESCE(excluded.sort_name, artist.sort_name),
        country = CASE
          WHEN artist.region_source = 'manual' THEN artist.country
          WHEN excluded.region_source = 'manual' THEN excluded.country
          ELSE COALESCE(excluded.country, artist.country)
        END,
        area = CASE
          WHEN artist.region_source = 'manual' THEN artist.area
          WHEN excluded.region_source = 'manual' THEN excluded.area
          ELSE COALESCE(excluded.area, artist.area)
        END,
        region = CASE
          WHEN artist.region_source = 'manual' THEN artist.region
          WHEN excluded.region_source = 'manual' THEN excluded.region
          ELSE COALESCE(excluded.region, artist.region)
        END,
        region_source = CASE
          WHEN artist.region_source = 'manual' THEN 'manual'
          WHEN excluded.region_source = 'manual' THEN 'manual'
          ELSE artist.region_source
        END,
        region_fetched_at = COALESCE(artist.region_fetched_at, excluded.region_fetched_at),
        updated_at = datetime('now')
    `)
    // MBID 已被另一个网易云行占用时的回退：保留地区，不写 MBID
    const upsertByNeteaseNoMbid = database.prepare(`
      INSERT INTO artist (
        netease_artist_id, netease_encrypted_id, name,
        sort_name, country, area, region, region_source, region_fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(netease_artist_id) DO UPDATE SET
        netease_encrypted_id = COALESCE(excluded.netease_encrypted_id, artist.netease_encrypted_id),
        name = excluded.name,
        sort_name = COALESCE(excluded.sort_name, artist.sort_name),
        country = CASE
          WHEN artist.region_source = 'manual' THEN artist.country
          WHEN excluded.region_source = 'manual' THEN excluded.country
          ELSE COALESCE(excluded.country, artist.country)
        END,
        area = CASE
          WHEN artist.region_source = 'manual' THEN artist.area
          WHEN excluded.region_source = 'manual' THEN excluded.area
          ELSE COALESCE(excluded.area, artist.area)
        END,
        region = CASE
          WHEN artist.region_source = 'manual' THEN artist.region
          WHEN excluded.region_source = 'manual' THEN excluded.region
          ELSE COALESCE(excluded.region, artist.region)
        END,
        region_source = CASE
          WHEN artist.region_source = 'manual' THEN 'manual'
          WHEN excluded.region_source = 'manual' THEN 'manual'
          ELSE artist.region_source
        END,
        region_fetched_at = COALESCE(artist.region_fetched_at, excluded.region_fetched_at),
        updated_at = datetime('now')
    `)
    const upsertByMbid = database.prepare(`
      INSERT INTO artist (musicbrainz_artist_id, name, sort_name, country, area, region, region_source, region_fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(musicbrainz_artist_id) DO UPDATE SET
        name = excluded.name,
        sort_name = COALESCE(excluded.sort_name, artist.sort_name),
        country = CASE
          WHEN artist.region_source = 'manual' THEN artist.country
          WHEN excluded.region_source = 'manual' THEN excluded.country
          ELSE COALESCE(excluded.country, artist.country)
        END,
        area = CASE
          WHEN artist.region_source = 'manual' THEN artist.area
          WHEN excluded.region_source = 'manual' THEN excluded.area
          ELSE COALESCE(excluded.area, artist.area)
        END,
        region = CASE
          WHEN artist.region_source = 'manual' THEN artist.region
          WHEN excluded.region_source = 'manual' THEN excluded.region
          ELSE COALESCE(excluded.region, artist.region)
        END,
        region_source = CASE
          WHEN artist.region_source = 'manual' THEN 'manual'
          WHEN excluded.region_source = 'manual' THEN 'manual'
          ELSE artist.region_source
        END,
        region_fetched_at = COALESCE(artist.region_fetched_at, excluded.region_fetched_at),
        updated_at = datetime('now')
    `)
    // 网易云 ID → 目标库当前 MBID（用于专辑导入时只写有效 MBID，避免旧外键失配）
    const getArtistMbidByNetease = database.prepare(
      'SELECT musicbrainz_artist_id FROM artist WHERE netease_artist_id = ?'
    )
    const artistMbidByNetease = new Map<number, string | null>()
    for (const artist of artists) {
      const neteaseId =
        typeof artist.netease_artist_id === 'number' ? artist.netease_artist_id : null
      const rawMbid = artist.musicbrainz_artist_id
      const mbid = typeof rawMbid === 'string' && rawMbid ? rawMbid : null
      const name = typeof artist.name === 'string' && artist.name ? artist.name : '未知艺人'
      const encryptedId =
        typeof artist.netease_encrypted_id === 'string' ? artist.netease_encrypted_id : null
      const sortName = typeof artist.sort_name === 'string' ? artist.sort_name : null
      const country = typeof artist.country === 'string' ? artist.country : null
      const area = typeof artist.area === 'string' ? artist.area : null
      const region = typeof artist.region === 'string' ? artist.region : null
      const regionSource = artist.region_source === 'manual' ? 'manual' : null
      const regionFetchedAt =
        typeof artist.region_fetched_at === 'string' ? artist.region_fetched_at : null

      if (neteaseId != null) {
        try {
          upsertByNetease.run(
            neteaseId,
            encryptedId,
            mbid,
            name,
            sortName,
            country,
            area,
            region,
            regionSource,
            regionFetchedAt
          )
        } catch (error) {
          const message = (error as Error).message ?? ''
          // 只把 MBID UNIQUE 冲突降级为「不写 MBID」；其他错误（如 FK）继续抛出
          if (!message.includes('UNIQUE constraint failed: artist.musicbrainz_artist_id')) {
            throw error
          }
          console.warn(
            `[Database] 导入 artist MBID 冲突（netease=${neteaseId}, mbid=${mbid}）:`,
            error
          )
          upsertByNeteaseNoMbid.run(
            neteaseId,
            encryptedId,
            name,
            sortName,
            country,
            area,
            region,
            regionSource,
            regionFetchedAt
          )
        }
        const current = getArtistMbidByNetease.get(neteaseId) as
          | { musicbrainz_artist_id: string | null }
          | undefined
        artistMbidByNetease.set(neteaseId, current?.musicbrainz_artist_id ?? null)
        result.artistsImported++
      } else if (mbid) {
        upsertByMbid.run(
          mbid,
          name,
          sortName,
          country,
          area,
          region,
          regionSource,
          regionFetchedAt
        )
        result.artistsImported++
      }
    }

    // 目标库当前存在的 MBID 集合：v3/v1/v2 导入时，album 只有旧 MBID 列，
    // 只有在该 MBID 确实存在时才写回，避免外键失配，同时保留地区关联。
    const targetMbidSet = new Set(
      (
        database
          .prepare(
            'SELECT musicbrainz_artist_id FROM artist WHERE musicbrainz_artist_id IS NOT NULL'
          )
          .all() as { musicbrainz_artist_id: string }[]
      ).map((row) => row.musicbrainz_artist_id)
    )

    // 1. Import genres (upsert by name；已存在时只补空着的 mb_genre_id，
    //    不改 name/id，避免破坏既有 album_genre 映射；旧版导出无该字段 → 写入 NULL)
    const upsertGenre = database.prepare(`
      INSERT INTO genre (name, mb_genre_id) VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET
        mb_genre_id = COALESCE(genre.mb_genre_id, excluded.mb_genre_id)
    `)
    for (const genre of data.data.genres) {
      upsertGenre.run(genre.name, genre.mb_genre_id ?? null)
    }
    result.genresImported = data.data.genres.length

    // Build old-id → new-id map for genres
    const genreIdMap = new Map<number, number>()
    for (const genre of data.data.genres) {
      const row = database.prepare('SELECT id FROM genre WHERE name = ?').get(genre.name) as { id: number }
      genreIdMap.set(genre.id as number, row.id)
    }

    // 2. Import albums (upsert by netease_album_id)
    const albumIdMap = new Map<number, number>()
    for (const album of data.data.albums) {
      const existing = database.prepare('SELECT id, primary_artist_id FROM album WHERE netease_album_id = ?').get(album.netease_album_id) as { id: number; primary_artist_id: number | null } | undefined

      // 网易云主艺人 ID：文件值优先，其次目标库已有值。
      // primary_artist_mbid 是历史外键列，只写目标库中确实存在的 MBID，
      // 不直接回写文件里的旧值（不同安装可能选中了不同的主 MBID）。
      const filePrimaryArtistId =
        typeof album.primary_artist_id === 'number' ? album.primary_artist_id : null
      const fileMbid =
        typeof album.primary_artist_mbid === 'string' && album.primary_artist_mbid
          ? album.primary_artist_mbid
          : null
      const targetPrimaryArtistId =
        filePrimaryArtistId ?? existing?.primary_artist_id ?? null

      let targetMbid: string | null = null
      if (targetPrimaryArtistId != null) {
        targetMbid = artistMbidByNetease.get(targetPrimaryArtistId) ?? null
      }
      // v3/v1/v2 文件没有 primary_artist_id：退回文件里的旧 MBID，但只在其
      // 确实存在于目标 artist 表时使用。这样 v3 备份导入空库后，启动迁移
      // 仍能从 album.primary_artist_mbid 收集候选并把网易云 ID 挂回地区行。
      if (targetMbid == null && filePrimaryArtistId == null && fileMbid) {
        if (targetMbidSet.has(fileMbid)) {
          targetMbid = fileMbid
        }
      }

      if (existing) {
        // 地区列使用 COALESCE：旧版导出（v1/v2）不含这些列，导入时不应把库中
        // 已有地区关联抹成 NULL；新专辑（INSERT 分支）仍按导入值或 NULL 落库。
        // artists 同理：v1-v3 文件没有结构化艺术家数据，不能把库中已有 JSON 抹成 NULL，
        // 否则艺人信息窗口会退化为文本拆分（含 '/' 的名字会被拆碎）。
        database.prepare(`
          UPDATE album SET
            title = ?, artist = ?, cover_url = ?, release_date = ?,
            musicbrainz_id = ?, mb_rating = ?, mb_rating_count = ?,
            track_count = ?, enriched_at = ?, user_rating = ?,
            netease_original_id = ?, physical_media = ?, artists = COALESCE(?, artists),
            external_links = ?, primary_artist_mbid = COALESCE(?, primary_artist_mbid),
            region_checked_at = COALESCE(?, region_checked_at),
            primary_artist_id = COALESCE(?, primary_artist_id)
          WHERE id = ?
        `).run(
          album.title, album.artist, album.cover_url, album.release_date,
          album.musicbrainz_id, album.mb_rating, album.mb_rating_count,
          album.track_count, album.enriched_at, album.user_rating,
          album.netease_original_id, album.physical_media,
          album.artists ?? null, album.external_links ?? null,
          targetMbid, album.region_checked_at ?? null,
          targetPrimaryArtistId,
          existing.id
        )
        albumIdMap.set(album.id as number, existing.id)
        result.albumsUpdated++
      } else {
        const info = database.prepare(`
          INSERT INTO album (netease_album_id, netease_original_id, musicbrainz_id, title, artist,
            cover_url, release_date, mb_rating, mb_rating_count, track_count, synced_at, enriched_at, user_rating,
            physical_media, artists, external_links, primary_artist_mbid, region_checked_at, primary_artist_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          album.netease_album_id, album.netease_original_id, album.musicbrainz_id,
          album.title, album.artist, album.cover_url, album.release_date,
          album.mb_rating, album.mb_rating_count, album.track_count,
          album.synced_at || new Date().toISOString(), album.enriched_at, album.user_rating,
          album.physical_media, album.artists ?? null, album.external_links ?? null,
          targetMbid, album.region_checked_at ?? null,
          targetPrimaryArtistId
        )
        albumIdMap.set(album.id as number, info.lastInsertRowid as number)
        result.albumsAdded++
      }
    }

    // 3. Import tracks (delete existing + re-insert for imported albums)
    const deleteTracksByAlbum = database.prepare('DELETE FROM track WHERE album_id = ?')
    const insertTrack = database.prepare(`
      INSERT INTO track (album_id, netease_song_id, netease_original_id, title, artist,
        track_number, disc_number, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const albumsWithTracks = new Set<number>()
    for (const track of data.data.tracks) {
      const newAlbumId = albumIdMap.get(track.album_id as number)
      if (!newAlbumId) continue
      if (!albumsWithTracks.has(newAlbumId)) {
        deleteTracksByAlbum.run(newAlbumId)
        albumsWithTracks.add(newAlbumId)
      }
      insertTrack.run(
        newAlbumId, track.netease_song_id, track.netease_original_id,
        track.title, track.artist, track.track_number, track.disc_number, track.duration_ms
      )
      result.tracksImported++
    }

    // 4. Import album_genre associations
    const deleteAlbumGenres = database.prepare('DELETE FROM album_genre WHERE album_id = ?')
    const insertAlbumGenre = database.prepare(
      'INSERT OR IGNORE INTO album_genre (album_id, genre_id) VALUES (?, ?)'
    )
    const importedAlbumsWithGenres = new Set<number>()
    for (const ag of data.data.albumGenres) {
      const newAlbumId = albumIdMap.get(ag.album_id as number)
      const newGenreId = genreIdMap.get(ag.genre_id as number)
      if (!newAlbumId || !newGenreId) continue
      if (!importedAlbumsWithGenres.has(newAlbumId)) {
        deleteAlbumGenres.run(newAlbumId)
        importedAlbumsWithGenres.add(newAlbumId)
      }
      insertAlbumGenre.run(newAlbumId, newGenreId)
    }

    // 5. Import followed artists (v2 起；按 name upsert，已存在时仅填补缺失的 ID 字段)
    const followedArtists = data.data.followedArtists ?? []
    const mergeFollowedArtist = database.prepare(`
      INSERT INTO followed_artist (name, original_id, encrypted_id)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        original_id = COALESCE(followed_artist.original_id, excluded.original_id),
        encrypted_id = COALESCE(followed_artist.encrypted_id, excluded.encrypted_id)
    `)
    for (const fa of followedArtists) {
      mergeFollowedArtist.run(fa.name, fa.original_id ?? null, fa.encrypted_id ?? null)
    }
    result.followedArtistsImported = followedArtists.length
  })

  importTx()

  // v3/历史导出没有网易云艺人键：用导入专辑的 artists 数据把 MBID 行关联到网易云 ID
  ensureNeteaseArtistIdentity(database)

  return result
}
