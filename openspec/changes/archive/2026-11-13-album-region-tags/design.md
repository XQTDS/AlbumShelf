# 技术方案

## 1. 数据模型

### 1.1 新增 `artist` 表

```sql
CREATE TABLE IF NOT EXISTS artist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  musicbrainz_artist_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_name TEXT,
  country TEXT,              -- MB 原始 country，如 CN / TW / HK / JP
  area TEXT,                 -- MB area 名称，如 Taiwan / Hong Kong / Taipei
  region TEXT,               -- 归一化地区键（大写 ISO 3166-1 alpha-2）
  region_fetched_at TEXT,    -- 地区已尝试解析的时间；NULL = 从未尝试
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
```

索引：

```sql
CREATE INDEX IF NOT EXISTS idx_artist_region ON artist(region);
```

设计要点：

- **以 MBID 为唯一键**，不按艺人名去重：实测「王菲」在 MB 有 HK 与 TW 两个同名结果，按名字匹配会张冠李戴。MBID 由已匹配 release-group 的 `artist-credit[].artist.id` 提供，是可靠关联。
- **`country` / `area` 保留原始值**，`region` 为归一化键。数据层存稳定代码，展示层再做中文映射，未来口径调整不必改数据。
- **`region_fetched_at` 是「已尝试」水位线**：解析成功但 MB 确实没有地区时也写入，避免每次回填重复查询；失败（网络/503）不写，留待下次重试。
- 不存网易云 artist ID：地区只依赖 MB 身份；网易云的 `album.artists` 仍是艺人展示与关注的真源，两者职责分离。

### 1.2 `album` 表新增列

```sql
ALTER TABLE album ADD COLUMN primary_artist_mbid TEXT REFERENCES artist(musicbrainz_artist_id);
ALTER TABLE album ADD COLUMN region_checked_at TEXT;
CREATE INDEX IF NOT EXISTS idx_album_primary_artist_mbid ON album(primary_artist_mbid);
```

- `primary_artist_mbid`：主艺人的 MB Artist MBID。**专辑不存 region 值**，查询时 `LEFT JOIN artist` 取 `region`，符合「地区跟 Artist 绑定」的设计。
- `region_checked_at`：专辑级地区补全水位线。`NULL` = 尚未尝试；成功解析（含「MB 无艺人地区」）后写入；查询失败保持 `NULL` 以便重试。
- 沿用现有迁移惯例：`CREATE_ALBUM_TABLE` 保持 v1 基线不动，新列只在 `PRAGMA table_info('album')` 守卫式迁移块中 `ALTER TABLE` 添加。`artist` 表在 album 迁移之前创建，保证外键目标存在。

### 1.3 数据关系

```text
album.primary_artist_mbid ──▶ artist.musicbrainz_artist_id (UNIQUE)
album.region_checked_at      —— 专辑级补全水位线
artist.region                —— 地区键（CN/TW/HK/...）
```

多艺人专辑只取 MB release-group 的 `artist-credit[0]`（主艺人）。合作专辑、群星合辑、OST 的其他参与者不参与地区判定——用户已确认「取主艺人」。

## 2. 地区归一化

新增 `src/main/region.ts`：

```ts
/** MB country / area → 归一化地区键（大写 ISO 3166-1 alpha-2） */
export function normalizeRegion(
  country: string | null | undefined,
  areaName: string | null | undefined,
  isoCodes?: string[] | null
): string | null

/** 地区键 → 中文展示名 */
export function regionLabel(region: string | null | undefined): string | null
```

归一化优先级：

1. `country` 为 2 位字母代码 → 直接大写使用。
2. `area['iso-3166-1-codes']` 非空 → 取第一个。
3. `area.name` 命中常见国家/地区/城市映射：
   - 国家/地区：China→CN、Taiwan→TW、Hong Kong→HK、Macao/Macau→MO、Japan→JP、South Korea/Korea→KR、United States→US、United Kingdom→GB 等。
   - 常见城市：Taipei/Kaohsiung/Taichung/Tainan→TW；Beijing/Shanghai/Guangzhou/Shenzhen/Chengdu/Wuhan/Nanjing/Hangzhou/Xi'an/Shijiazhuang→CN；Tokyo/Osaka/Kyoto/Nagoya/Fukuoka/Sapporo→JP；Seoul/Busan/Incheon→KR；London/Manchester/Liverpool/Glasgow→GB；New York/Los Angeles/Chicago/San Francisco/Seattle/Boston→US 等。
4. 无法识别 → `null`，**不猜测**。

展示优先级：

- `CN` → 中国大陆
- `TW` → 中国台湾
- `HK` → 中国香港
- `MO` → 中国澳门
- 其他代码 → `new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(code)`；异常或空值回退原始代码。
- `null` → 不显示标签（表格不渲染，详情显示「—」）。

MB 的 `country/area` 语义是「主要关联地区」，不等于出生地。例如王菲 MB 为 `country=HK`、`area=Hong Kong`、`begin-area=Beijing`。本变更以 `country/area` 为准，不采用 `begin-area`，与「用户确认按 MB 数据」一致。

## 3. 补全链路

### 3.1 新专辑自动补全

`enrich-service.ts`：

1. `matchAlbum` / `processConfirmedMatch` 的 release-group lookup include 增加 `'artist-credits'`：
   ```ts
   mbApi.lookup('release-group', mbid, ['ratings', 'genres', 'artist-credits', 'url-rels'])
   ```
   该请求本来就要发，增加 include **零额外请求**。
2. 从 `details['artist-credit'][0].artist` 取：
   - `id` → `musicbrainz_artist_id`
   - `name` / `sort-name`
   - `country`（实测 release-group 的 artist-credit 已带 country）
   - `area?.name`（可能为空）
3. 若 `country` 为空，先查本地 `artist` 表是否已有该 MBID 的 `region_fetched_at`；没有则发一次 `mbApi.lookup('artist', artistId)`，取 `country`、`area`、`begin-area`。每个艺人至多一次，服务内 `Map<mbid, MbArtistRegion>` 缓存。
4. 解析结果写入 `MbMatchResult.artist`；`enrichAlbum` / `processConfirmedMatch`：
   - `artistService.upsertArtist(...)`
   - `albumService.updateAlbum(album.id, { primary_artist_mbid, region_checked_at })`
   - 若 artist 解析因网络失败：**不写新的** `primary_artist_mbid`（保留旧值供界面暂时展示），并把 `region_checked_at` 置为 NULL（覆盖旧水位线），标记本次解析未成功；专辑匹配本身仍成功。若只保留旧水位线，重匹配后该专辑将永远不会再尝试地区解析。
   - 若 lookup 成功但 artist-credit 缺失：写 `primary_artist_mbid = NULL`、`region_checked_at = now`（视为已尝试）。
5. `resetAllEnrichment` / 单张 resync **不清空** `primary_artist_mbid` / `region_checked_at`（与 `external_links` 同思路：地区是艺人级缓存，重新补全成功时会覆盖；失败时保留旧主艺人引用供界面展示）。注意：重新匹配成功但地区解析失败时，`buildRegionUpdate` 会把 `region_checked_at` 置 NULL，后续重新补全可再次尝试。`artist` 表也不清空。

### 3.2 存量回填（一次性，入口已移除）

存量专辑只存 release-group MBID，没有艺人 MBID，因此首次需要逐张 `lookup('release-group', mbid, ['artist-credits'])` 建立「专辑 → 主艺人」映射；地区本身按 MBID upsert 到 artist 表并缓存，同一艺人只解析一次。

该批量回填曾以菜单「数据 → 补全艺人地区」+ IPC `region:backfill` 的形式提供，用户已执行完成。按用户要求，**菜单入口、IPC、preload API、渲染层处理与相关服务方法均已移除**；后续新专辑随正常补全自动写入地区，不再提供批量回填入口。`region_checked_at` 保留为「最近一次地区解析尝试时间」的记录字段。

## 4. 查询与筛选

### 4.1 `Album` 类型

`album-service.ts` 的 `Album` 增加：

```ts
primary_artist_mbid: string | null
region: string | null        // JOIN 派生，不落 album 表
region_area: string | null   // JOIN 派生，MB area 名称，供 tooltip
region_label?: string | null // 主进程用 regionLabel() 派生
```

`AlbumUpdate` / `AlbumInsert` 增加 `primary_artist_mbid?`、`region_checked_at?`（`AlbumInsert` 第一版不需要，补全时再写；为完整性可只加 `AlbumUpdate`）。

### 4.2 查询

- `getAlbumById` / `getAlbumByNeteaseAlbumId` / `queryAlbums` 统一使用：
  ```sql
  SELECT a.*, ar.region AS region, ar.area AS region_area
  FROM album a
  LEFT JOIN artist ar ON ar.musicbrainz_artist_id = a.primary_artist_mbid
  ```
- `queryAlbums` 的 count 查询同样带 join；`COUNT(DISTINCT a.id)` 不受 1:1 join 影响。
- 返回前用 `regionLabel(row.region)` 填充 `region_label`。
- 新筛选参数 `AlbumQueryOptions.region?: string`：
  ```sql
  AND ar.region = @region
  ```

### 4.3 筛选候选

`ArtistService.getUsedRegions()`：

```sql
SELECT ar.region AS region, COUNT(DISTINCT a.id) AS count
FROM artist ar
INNER JOIN album a ON a.primary_artist_mbid = ar.musicbrainz_artist_id
WHERE ar.region IS NOT NULL
GROUP BY ar.region
ORDER BY count DESC, ar.region
```

返回 `{ key, label, count }[]`。`album:filters` 响应增加 `regions`。

## 5. 渲染层

### 5.1 表格

- **不新增列**：现有 8 列在最小窗口宽度下已接近饱和，新增第 9 列会挤压布局。
- 在艺术家单元格内、艺术家名下方渲染地区 chip：
  ```html
  <td class="col-artist">
    <div class="artist-cell">
      <div class="artist-names">…现有艺术家文本…</div>
      <span v-if="album.region_label" class="region-tag" :title="album.region_area || album.region_label">
        {{ album.region_label }}
      </span>
    </div>
  </td>
  ```
- `.region-tag` 用绿色系（`#ecfdf5` 底 / `#047857` 字），与风格标签的靛蓝色区分；字号 10px，圆角 10px。
- 无地区不渲染 chip（保持艺术家单元格整洁）。
- 行 `v-memo` 依赖增加 `album.region_label`、`album.region_area`。

### 5.2 详情面板

- 在 `.detail-meta` 的「发行日期」之前增加：
  ```html
  <div class="meta-item">
    <span class="meta-label">地区</span>
    <span class="meta-value">
      <span v-if="selectedAlbum.region_label" class="region-tag">{{ selectedAlbum.region_label }}</span>
      <span v-else>—</span>
    </span>
  </div>
  ```
- 可选 `:title="selectedAlbum.region_area"` 展示 MB area 原文。

### 5.3 工具栏筛选

- 在风格筛选输入框后增加一个 `<select>`：
  ```html
  <select v-model="selectedRegion" class="region-filter-select" @change="onRegionChange"
          :disabled="filterRegions.length === 0"
          :title="filterRegions.length === 0 ? '暂无地区数据，新专辑补全后自动出现' : '按地区筛选'">
    <option value="">全部地区</option>
    <option v-for="r in filterRegions" :key="r.key" :value="r.key">{{ r.label }}</option>
  </select>
  ```
- 单选（地区是固定枚举，与多选风格不同）；选「全部地区」清空筛选。
- `buildAlbumQueryOptions` 增加 `region: selectedRegion || undefined`。
- `onRegionChange()` 调 `resetAndFetch(selectedAlbumId.value)`，与风格筛选一致。
- `fetchFilters()` 写入 `filterRegions`。
- 随机选择/播放条封面定位清除筛选时，同步清空 `selectedRegion`。

### 5.4 唱片墙

- 不展示地区（与现有风格标签一致）。作为非目标记录。

## 6. 导出 / 导入

- `ExportData.version` 从 `2` 升到 `3`；`ImportData` 接受 `1 | 2 | 3`。
- 导出新增 `data.artists = SELECT * FROM artist`；专辑 `SELECT *` 自动带 `primary_artist_mbid` / `region_checked_at`。
- 导入顺序：
  1. 先 upsert `artists`（按 `musicbrainz_artist_id` 唯一键）：
     ```sql
     INSERT INTO artist (musicbrainz_artist_id, name, sort_name, country, area, region, region_fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(musicbrainz_artist_id) DO UPDATE SET
       name = excluded.name,
       sort_name = COALESCE(excluded.sort_name, artist.sort_name),
       country = COALESCE(excluded.country, artist.country),
       area = COALESCE(excluded.area, artist.area),
       region = COALESCE(excluded.region, artist.region),
       region_fetched_at = COALESCE(excluded.region_fetched_at, artist.region_fetched_at),
       updated_at = datetime('now')
     ```
  2. 再导入 album，在 UPDATE / INSERT 列清单中加入 `primary_artist_mbid`、`region_checked_at`（漏列会静默丢字段）。
- 旧版导出（v1/v2）：`artists` 按空数组处理；对已存在专辑，UPDATE 用 `COALESCE` 保留库中已有的 `primary_artist_mbid` / `region_checked_at`，避免旧备份抹掉地区关联；新专辑按 `NULL` 落库，导入后需通过「重新补全所有专辑」或单张重新同步触发地区解析。
- `ImportResult` 增加 `artistsImported`；导出结果统计增加 `artists`（用于提示）。
- `artist_update` 表仍不进入导出（派生数据）。

## 7. 边界与规则

| 场景 | 规则 |
|---|---|
| 多艺人专辑 | 只取 MB release-group `artist-credit[0]`，其他参与者忽略 |
| 群星/合辑 | 主艺人为 Various Artists 或无 country → 地区留空 |
| 同名艺人 | 只用 release-group artist-credit 的 MBID，不按名字搜索 |
| MB country 为空、area=Taipei | 归一化为 TW |
| MB country/area 均无法识别 | `region = NULL`，展示「—」，不猜测 |
| MB 查询失败（503/网络） | 不写新的 `primary_artist_mbid`，将 `region_checked_at` 置 NULL，回填可重试 |
| 专辑无 MB 匹配 | `primary_artist_mbid = NULL`，地区为空；需先补全 MB |
| 重新补全/单张 resync | 不清空 artist 表与专辑地区引用；成功匹配后覆盖；匹配成功但地区解析失败时清空 `region_checked_at` 以便回填重试 |
| 手动编辑 | 不提供；地区只来自 MB |

## 8. 受影响 Spec

- **新增** `openspec/specs/artist-region/spec.md`：artist 表结构、MB 地区来源、归一化、主艺人规则、补全与回填、导出导入。
- 修改 `openspec/specs/local-storage/spec.md`：artist 表、album 新列迁移、导出导入 v3。
- 修改 `openspec/specs/data-enrichment/spec.md`：artist-credits、artist lookup 兜底、地区写入、回填、重置语义。
- 修改 `openspec/specs/album-list-ui/spec.md`：地区 chip、地区筛选、v-memo。
- 修改 `openspec/specs/album-detail-expand/spec.md`：详情「地区」元数据。
- `data-sync`、`ncm-cli-adapter` 无行为变更；仅在 artist-region spec 中说明网易云字段不参与地区判定。
- README 同步：功能说明、数据菜单、导出格式版本。

## 9. 风险与验证

- **覆盖率不保证**：独立/小众艺人缺失（实测 4/60 未解析，反例「重塑雕像的权利」）。留空而非猜测，用户可后续另开变更做手动覆盖。
- **MB 语义偏差**：`country/area` 是主要关联地区，不是出生地（王菲 HK，出生地北京）。按用户确认以 MB 为准。
- **同名艺人**：必须用 MBID 关联；代码不得引入按 name 搜索 artist 的路径。
- **回填耗时与稳定性**：1 req/s，约 37 分钟；503 需重试。第一版无取消，需应用保持打开。
- **`SELECT DISTINCT a.*, ar.region` 的字段冲突**：album 表没有 `region`/`region_area` 列，别名不会冲突；实现时仍需确认 `a.*` 与新列名不重名。
- **导出导入列清单**：`primary_artist_mbid` / `region_checked_at` 必须同时加入 UPDATE 与 INSERT，漏一处会静默丢字段。
- **验证方式**：按项目约定不自动跑 typecheck；由用户手动 `npm run dev` 验证。实现后重点检查：
  1. 新专辑补全后地区出现；
  2. 存量专辑一次性回填已完成；回填入口已按用户要求移除，确认新专辑补全后地区自动出现；
  3. 地区筛选与其他筛选组合；
  4. 导出 → 清库 → 导入后地区保留；
  5. 独立艺人显示「—」。
