# 技术方案

## 1. 数据模型

### 1.1 artist 表

新库由 `CREATE_ARTIST_TABLE` 直接创建最终 schema；旧库若 `musicbrainz_artist_id` 仍为 NOT NULL，则在 `foreign_keys=OFF` 下重建（保留所有行与 id，仅把 MBID 放宽为可空，仍保持 UNIQUE），再新增：

```sql
ALTER TABLE artist ADD COLUMN netease_artist_id INTEGER;
ALTER TABLE artist ADD COLUMN netease_encrypted_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_netease_id ON artist(netease_artist_id);
```

- `netease_artist_id` 是**业务唯一键**：一个网易云艺人一行；NULL 仅用于历史 MBID 行。
- `musicbrainz_artist_id` 退化为地区来源属性；仍保持 UNIQUE（刻意保留：专辑旧外键仍指向它，迁移也按 MBID 定位历史行）。
- `name` 存网易云展示名（新建行/迁移时写入）；`sort_name` 保留 MB 排序名。
- 同一 MBID 对应多个网易云 ID 时：选一个「归属行」保存 MBID，其他行复制 `country/area/region/region_fetched_at`，`musicbrainz_artist_id` 保持 NULL。

旧表重建由 `rebuildArtistTable(db)` 完成：`PRAGMA table_info('artist')` 检测 `musicbrainz_artist_id.notnull = 1`；`foreign_keys=OFF` 后单事务执行 `CREATE artist_new` → `INSERT ... SELECT`（保留全部行与 id）→ `DROP TABLE artist` → `RENAME`，结束后恢复 `foreign_keys=ON`；`album.primary_artist_mbid` 的外键按表名解析到新表。检测到已可空时直接返回，保证幂等。

已重建/部分迁移库若缺少新列，则用上面的 `ALTER TABLE` 兼容路径补齐。

### 1.2 album 表

```sql
ALTER TABLE album ADD COLUMN primary_artist_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_album_primary_artist_id ON album(primary_artist_id);
```

- `primary_artist_id` = `album.artists[0].originalId`（网易云明文艺人 ID）。
- 不声明外键：artist 行可能在专辑之后由迁移/补全创建；查询用 LEFT JOIN，缺行时地区为空。
- 旧 `primary_artist_mbid` 列保留：查询与地区展示不再使用；启动迁移读取它以选择各网易云艺人的主 MBID，导入与补全时只写入目标库中有效的 MBID（维持旧外键、旧备份地区关联与 split 行合并）。

### 1.3 查询

```sql
SELECT a.*, ar.region AS region, ar.area AS region_area
FROM album a
LEFT JOIN artist ar ON ar.netease_artist_id = a.primary_artist_id
```

`getAlbumById` / `getAlbumByNeteaseAlbumId` / `queryAlbums` 全部改用该 JOIN；地区筛选条件仍为 `ar.region = @region`。

## 2. 迁移：ensureNeteaseArtistIdentity

在 `initDatabase` 的表结构迁移之后执行，幂等、单事务：

### 2.1 解析与分组

对每张专辑：

- `artists` JSON 第一个元素 → `{ originalId, id, name }`；
- `originalId` 必须是数字，才参与分组；否则跳过（无结构化艺人的历史行无法可靠关联）；
- 记录该专辑的 `primary_artist_id = originalId`。

按 `originalId` 分组，组内记录：

- 专辑列表；
- 候选 MBID → 专辑数（只统计 `primary_artist_mbid` 非空的 MB 匹配专辑）。

### 2.2 选主 MBID

对每个网易云艺人组：

1. 候选 = 组内出现过的 MBID；
2. 先过滤出能与网易云主艺人确认为同一实体的候选（名称/别名完全相同、包含关系、或 CJK 字符重合率 ≥ 60%）；
3. 无任何候选可确认 → 选主为空，不写 MBID/地区（宁可留空，不把作曲家/合辑/同名不同人的地区挂错）；
4. 在可确认候选中，优先保留 `artist.region` 非空的候选；
5. 再按组内专辑数降序；
6. 并列按 MBID 字典序。

这样优先选到「同一实体、有地区、且被最多专辑使用」的 MB 实体。实测本库 41 个网易云艺人 ID 对应多个 MBID（共 46 张非主 MBID 专辑），其中部分不能确认同一实体（如郎朗名下的 Bach 专辑、群星合辑）；这类组不再复制其他实体的地区。

### 2.3 写入 artist 行

按网易云 ID 升序处理：

1. 查找 `artist.netease_artist_id = ?` 的行；
2. 若不存在，插入 `{ netease_artist_id, netease_encrypted_id, name }`；
3. 若存在且 `musicbrainz_artist_id` 为空：
   - 主 MBID 行尚未绑定网易云 ID → 先把当前网易云行的缺失字段合并进 MB 行，再删除网易云行并把网易云 ID 挂到 MB 行（同一 MBID 只落一行）；
   - 主 MBID 已被其他网易云行占用 → 复制 `country/area/region/region_fetched_at`，不写 MBID（避免 UNIQUE 冲突）；
4. 若已有 `musicbrainz_artist_id` 且已有地区：保持不变（迁移阶段以已有数据为准）；
5. 记录新增/复用/合并/复制计数并输出日志。

### 2.4 回填专辑

```sql
UPDATE album SET primary_artist_id = ? WHERE id = ?
```

所有有结构化主艺人 ID 的专辑都写入；重复执行无变化。

### 2.5 幂等性

- 艺术家行按 `netease_artist_id` 查找；已存在则不再插入；
- MBID/地区只在为空时写入；
- `primary_artist_id` 用相同值重复 UPDATE；
- 无变化时仅一次全表读 + 事务内少量 UPDATE。

## 3. 运行时补全

### 3.1 新专辑入库

`AlbumService.insertAlbum` 解析 `album.artists` 第一个元素，写入 `primary_artist_id`。同步、在线添加、导入（后续 ensure）都会带上。

### 3.2 MB 补全

`buildRegionUpdate` 改为接收当前 `album`：

```ts
const primary = albumArtistRefs(album)[0]
if (primary?.originalId == null) return { region_checked_at: null }
artistService.upsertArtist({
  neteaseArtistId: primary.originalId,
  neteaseEncryptedId: primary.id,
  name: primary.name,
  musicbrainzArtistId: artist.mbid,
  ...
})
return { primary_artist_id: primary.originalId, region_checked_at: now }
```

`artistService.upsertArtist` 规则：

- 按 `netease_artist_id` 查找/插入；
- 行内已有非空 `region` → 保留（first-wins），只补缺失的加密 ID/名称；
- 行内地区为空 → 用本次 MB 结果填充；
- 若 MBID 已被另一个网易云行占用 → 复制地区字段但保持本行 `musicbrainz_artist_id = NULL`；
- 若本行 MBID 为空且目标 MBID 未被占用 → 写入 MBID；
- 全部在单事务内，冲突只记录警告，不中断补全。

### 3.3 无 MB 匹配的专辑

`primary_artist_id` 已在入库/迁移时写好；只要同一网易云艺人的 artist 行有地区，查询即可显示，不再需要推断兜底。上一版新增的 `inferPrimaryArtistFromNeteaseIds` 与所有调用点删除。

## 4. 导出 / 导入

### 4.1 版本

- `ExportData.version` 升到 **4**；`ImportData` 接受 `1 | 2 | 3 | 4`。
- `artists` 为 `SELECT * FROM artist`，自动包含 `netease_artist_id` / `netease_encrypted_id`。
- album 导出包含 `primary_artist_id`（`SELECT *`）。

### 4.2 导入 artist

- v4 行有 `netease_artist_id` → 按网易云 ID upsert；`musicbrainz_artist_id` **仅在目标行为空时填充**，已有 MBID 不被覆盖（避免修改旧外键父键）；
- 无网易云 ID、有 MBID（v3 或历史行）→ 按 `musicbrainz_artist_id` upsert，`netease_artist_id` 留空；
- 两者都没有 → 跳过；
- 只有 `artist.musicbrainz_artist_id` 的 UNIQUE 冲突才降级为「不写 MBID」；其他错误（如外键）继续抛出。

### 4.3 导入 album

- UPDATE / INSERT 列清单加入 `primary_artist_id`；
- 历史列 `primary_artist_mbid` **只写目标库中存在的 MBID**：
  - v4 按 `primary_artist_id` 查目标 artist 的当前 MBID；
  - v1/v2/v3 退回文件中的 `primary_artist_mbid`，但仅当该 MBID 已在目标 artist 表存在（v3 artist 行先按 MBID 导入）；
  - 都查不到则写 NULL（UPDATE 用 COALESCE 保留库中已有有效值）；
- 这样 v3 备份导入空库后，启动迁移仍能从 `album.primary_artist_mbid` 收集候选并把网易云 ID 挂回带地区的 MB 行；
- 导入完成后调用 `ensureNeteaseArtistIdentity`：v3 的 MBID 行会按专辑的网易云主艺人 ID 关联到网易云键；v1/v2 的新专辑会按 `artists` 回填 `primary_artist_id`。

## 5. 影响面

- `database.ts`：artist/album 列、索引、迁移函数、导出 v4、导入调整。
- `artist-service.ts`：`ArtistRegionInput`、`upsertArtist`、`getArtistByNeteaseId`、`getUsedRegions` JOIN。
- `album-service.ts`：`Album.primary_artist_id`、JOIN、`insertAlbum`、删除推断方法。
- `enrich-service.ts`：`buildRegionUpdate` 使用专辑的网易云主艺人。
- `ipc-handlers.ts`：删除 `inferArtistLinks` 及全部调用。
- `preload/index.d.ts`、`App.vue`：`Album.primary_artist_id` 类型。
- specs / README：artist 表结构与导出格式。

## 6. 风险

| 风险 | 处理 |
|---|---|
| 一个网易云 ID 对应多个 MBID（本库 41 组） | 先按「MB 艺人 vs 网易云主艺人同一实体」过滤；可确认的候选中选「有地区 + 专辑数最多」；无候选可确认时留空，不挂作曲家/合辑地区 |
| 一个 MBID 对应多个网易云 ID（本库 18 组） | 一个归属行保存 MBID，其他行复制地区、MBID 置空 |
| 网易云行已存在但 MBID 为空 + 未绑定的历史 MBID 行 | 迁移时合并两行（MB 行保留 MBID/地区，网易云行删除），避免运行期 UNIQUE 崩溃 |
| 无结构化 `artists` 的历史专辑 | 不参与，`primary_artist_id` 为空，地区显示「—」 |
| 旧 `primary_artist_mbid` 与新键不一致 | 查询/展示只用新键；旧列由迁移读取、导入写入有效 MBID，避免外键失配 |
| 导入后 MBID UNIQUE 冲突 | 只捕获该 UNIQUE 冲突并降级为「不写 MBID」；其他错误继续抛出 |
| 迁移重复执行 | 全流程幂等，无变化零写入 |

## 7. 验证

1. 启动后所有有 `artists` 的专辑 `primary_artist_id` 非空；旺福 id 266 / 2730 与 id 2729 同属网易云 13191，均显示 TW。
2. 可确认同一实体的专辑地区保持；无法确认（如郎朗名下的 Bach 专辑、群星合辑）的组留空，不显示其他实体的地区。
3. 地区筛选、详情、导出导入仍正常。
4. 导入 v3 备份后，原有地区通过网易云键关联保留；导入 v4 在不同主 MBID 的库之间不再触发外键回滚。
5. 按项目约定不自动跑 typecheck，由用户 `npm run dev` 验证。
