# 技术设计：MusicBrainz 风格库全量同步

## 1. 现状

### 1.1 标签库只有一个来源：用过即有

- `genre(id, name UNIQUE)` 是本地词表，`album_genre(album_id, genre_id)` 是唯一映射来源（[database.ts:43-58](../album-shelf/src/main/database.ts#L43-L58)）。
- 写入路径只有两条，都是「用到才建行」：
  - 数据补全：`fillAlbumGenresIfEmpty` → `setAlbumGenres`（MB 风格名 + `INSERT OR IGNORE` 兜底建档）
  - 手动编辑：`album:setGenres` → `setAlbumGenres`
- 因此库里的风格 = 实际用过的风格集合，没有全量词表。

### 1.2 编辑框候选与工具栏筛选共用一份数据

`album:filters` → `getAllGenres()`（`SELECT name FROM genre ORDER BY name`，[album-service.ts:414](../album-shelf/src/main/album-service.ts#L414)）→ App.vue `genres` ref，同时供：

- 工具栏风格筛选建议 `filteredGenreSuggestions()`（[App.vue:2097](../album-shelf/src/renderer/src/App.vue#L2097)）
- 详情面板编辑框建议 `filteredGenreEditSuggestions()`（[App.vue:1986](../album-shelf/src/renderer/src/App.vue#L1986)）

编辑框对不存在的标签无回车处理，spec 也明确不允许创建 —— 「库中没有的风格」在 UI 上完全不可达。

### 1.3 MB 风格全量清单可编程获取

- `GET /ws/2/genre/all?fmt=json&limit=100&offset=N` 返回 `{ "genre-count": 2201, "genre-offset": N, "genres": [{ id, name, disambiguation }] }`，`limit` 上限 100 → 23 页。
- 实测全量 2201 条：名称全小写、大小写归一后**无重复**；含非 ASCII（`afoxé`、`cải lương`、`čalgija`）；少量带 `disambiguation`（如 `afrobeat` / `afrobeats`）。
- 注意：这里的 genre 对象**没有 `count` 字段**（`count` 只在实体 lookup 的 `inc=genres` 里出现，即 [enrich-service.ts:10-15](../album-shelf/src/main/enrich/enrich-service.ts#L10-L15) 的 `IMbGenre`）。同步服务需自定义列表响应类型，不复用那个接口。
- `musicbrainz-api@1.2.0` 的 `restGet(relUrl, query)` 是 public 方法，自动补 `/ws/2` 前缀与 `fmt=json`，并走同一 1 req/s 限流（[mb-client.ts](../album-shelf/src/main/enrich/mb-client.ts) 已配 `rateLimit: [1, 1]`）。
- 其内建重试对 429/503 生效，但间隔固定为 500ms、`retryLimit: 10`（`node_modules/musicbrainz-api/lib/http-client.js`）——实测的持续限流下不够，需要页级退避。

## 2. 数据模型

`genre` 新增可空列 `mb_genre_id TEXT`（MB 风格 UUID）。用途：标记「该风格来自 MB 官方词表」、支撑将来按 UUID 检测改名/合并。本期不消费 `disambiguation`，不入库。

迁移沿用现有 `PRAGMA table_info` 惯用法（[database.ts:126-157](../album-shelf/src/main/database.ts#L126-L157)）：

```ts
const genreColumns = db.prepare("PRAGMA table_info('genre')").all() as { name: string }[]
if (!genreColumns.some((c) => c.name === 'mb_genre_id')) {
  db.exec('ALTER TABLE genre ADD COLUMN mb_genre_id TEXT')
}
```

导出/导入：`exportDatabase` 用 `SELECT *`，新列自动带出；`importDatabase` 的 genre 写入由 `DO NOTHING` 改为「只补空 `mb_genre_id`」：

```sql
INSERT INTO genre (name, mb_genre_id) VALUES (?, ?)
ON CONFLICT(name) DO UPDATE SET
  mb_genre_id = COALESCE(genre.mb_genre_id, excluded.mb_genre_id)
```

旧导出文件（v1/v2）无该字段 → 写入 NULL，向后兼容，**不 bump `ExportData.version`**。冲突分支只动 `mb_genre_id`，`name`/`id` 不变 → 导入不会破坏专辑↔风格映射（`album_genre` 重建逻辑照旧按 name 映射 id）。

## 3. 同步服务

新增 `src/main/genre-library-service.ts`（网络 + 批处理，与纯 DB 的 `AlbumService` 职责分开，组织方式仿 `EnrichService`）。

```ts
export interface GenreLibrarySyncProgress {
  current: number   // 已处理风格数
  total: number     // genre-count
  added: number     // 累计新增
  existing: number  // 累计已存在
}

export interface GenreLibrarySyncResult {
  added: number
  existing: number
  total: number
  aborted: boolean  // 中途失败中止（已写入部分保留）
  error?: string
}

export class GenreLibraryService {
  constructor(private albumService: AlbumService) {}
  async sync(onProgress?: (p: GenreLibrarySyncProgress) => void): Promise<GenreLibrarySyncResult>
  get isSyncing(): boolean
}
```

### 3.1 分页拉取

```ts
let offset = 0
let total = Number.POSITIVE_INFINITY
while (offset < total) {
  const page = await this.fetchPage(offset)   // 带页级退避重试
  total = page['genre-count']
  this.persistPage(page.genres)               // 每页一个事务
  offset += page.genres.length
  if (page.genres.length === 0) break         // 防御：空页兜底退出，避免死循环
  onProgress?.({ current: offset, total, added, existing })
}
```

`fetchPage` 最多尝试 4 次，退避 2s / 5s / 10s（覆盖 503 与网络错误）；4 次仍失败 → 抛错，由 `sync` 捕获后转为 `aborted: true` + 已完成统计返回。**已写入的数据不清空、不回滚**（幂等，重跑即续）。

### 3.2 写入：只增不改不删

- 同步开始前一次性 `SELECT id, name FROM genre`，在内存建 `Map<name.toLowerCase(), id>`。
  - **不能用 SQL 的 `lower()` 建索引**：SQLite 内建 `lower()` 只处理 ASCII，`afoxé` 这类名称会漏；JS `toLowerCase()` 覆盖 Unicode。
- 逐条处理：
  - 命中 Map（大小写不敏感）→ 该行 `mb_genre_id` 为空时执行 `UPDATE genre SET mb_genre_id = ? WHERE id = ? AND mb_genre_id IS NULL`（`IS NULL` 为第二道防线）；计入 `existing`。
  - 未命中 → `INSERT INTO genre (name, mb_genre_id) VALUES (?, ?)`，把新 id 写回 Map（防同批次重复插入）；计入 `added`。
- 每页一个事务（`db.transaction`）：23 次提交而非 2201 次。
- **同步路径禁止的操作**：`DELETE FROM genre`、`DELETE FROM album_genre`、`UPDATE genre SET name = ?`。已有映射（`album_genre`）不可能被本功能改动 —— 这是本需求最硬的约束。
- MB 侧删掉某个风格时，本地行保留（可能仍被专辑使用），不做「反向清理」。

### 3.3 进度

每页写入完成后回调一次（约 23 次）：`{ current: 已处理条数, total: genre-count, added, existing }`。

## 4. 接口与接线

### 4.1 主进程

- `ipc-handlers.ts`：
  - `genre:librarySyncStart`（`ipcMain.handle`）：防重入标志 `genreLibrarySyncRunning`（沿用 `coverFill` / `artistIdFill` 既有模式），同步中通过 `event.sender.send('genre:librarySyncProgress', progress)` 推送进度，返回 `IpcResult<GenreLibrarySyncResult>`。
  - `genre:library`（`ipcMain.handle`）：返回全量风格名 `string[]`（编辑框候选），复用 `albumService.getAllGenres()`。
  - `album:filters` 的 genres 改用新增的 `albumService.getUsedGenres()`（`SELECT DISTINCT g.name FROM genre g JOIN album_genre ag ON g.id = ag.genre_id ORDER BY g.name`）→ 工具栏筛选建议只含在用风格。
  - `getAllGenres()`（全量）保留供 `genre:library` 使用；两个方法名区分「全量库」与「在用」。
- `index.ts` 菜单：数据菜单的 MB 分组首项新增「同步 MusicBrainz 风格库」→ `webContents.send('menu:genreLibrarySync')`。
- 不加 `genre:librarySyncStatus`：同步无 pending 语义，且同步中重载渲染进程属边缘场景，保持接口最小。

### 4.2 预加载

`preload/index.ts` + `index.d.ts` 新增：`syncGenreLibrary()`、`genreLibrary()`、`onMenuGenreLibrarySync()`、`onGenreLibrarySyncProgress()`。

### 4.3 渲染层 App.vue

- 候选数据拆两份：
  - `filterGenres`（原 `genres` 语义收窄）← `albumFilters()`，供工具栏筛选建议；
  - `genreLibrary` ← `genreLibrary()`，供编辑框建议，启动时拉一次。
  - `filteredGenreSuggestions()` 改用 `filterGenres`；`filteredGenreEditSuggestions()` 改用 `genreLibrary`。
- **候选上限**：`filteredGenreEditSuggestions()` 最多返回 50 条（前缀命中优先，其次字母序），并在下拉框末尾追加不可点的「还有 N 个匹配，请继续输入…」提示行 —— 2201 条词表下输入单字母会命中数百条，不设上限不可用。
- 保存风格后（`saveEditGenres`）刷新 `filterGenres`（新关联的风格需要能出现在筛选建议里）；`genreLibrary` 不需要刷新（保存不新建标签）。
- 同步流程 `handleGenreLibrarySync()`：菜单事件触发 → 调 `syncGenreLibrary()` → 显示进度条（复用 `.enrich-bar`，同 `releaseDateFillProgress` 模式）→ 完成后刷新 `genreLibrary` + `filterGenres` → `showMessage` 汇总「新增 X 个 / 已存在 Y 个 / 共 N 个」，`aborted` 时提示失败原因并说明已完成的增量已保留。

## 5. 边界与不变量

- **映射不变式**：同步前后 `SELECT COUNT(*) FROM album_genre`、以及各专辑的风格列表，必须完全不变（QA 可断言）。
- **幂等**：连跑两次，第二次 `added = 0`、`existing = 2201`。
- **大小写去重**：库中已有手工建的 `Rock`，MB 有 `rock` → 命中已有行，只补 `mb_genre_id`，不新建重复行。
- **非 ASCII 名称**：原样存储，不做归一化/翻译。
- **与补全流程共存**：MB 出现库中没有的新风格时，`setAlbumGenres` 仍会 `INSERT OR IGNORE` 建行（无 `mb_genre_id`）；下次同步会把它认作已有行并补上 UUID，无需额外处理。
- **失败与部分写入**：中止后已写入的行保留且有效；重跑从 offset 0 重新拉全量，增量写入不会产生重复。
- **不影响的既有行为**：`genre-stats`（INNER JOIN，自动只统计在用风格）、`resetAllEnrichment`、专辑删除级联、同步删除专辑时的风格级联清理，全部不变。
- `album:filters` 改用 `getUsedGenres()` 在同步之前与现状完全等价（库里不存在零专辑风格），只影响同步之后。

## 6. QA 关注点

- 同步前记录基线：`SELECT COUNT(*) FROM genre`、`SELECT COUNT(*) FROM album_genre`、任一专辑的风格列表快照。
- 同步中进度条递增、UI 不卡；完成后编辑框能搜到此前不存在的 MB 风格（如 `shoegaze`）。
- 同步后基线三项与专辑风格快照完全一致（映射零变化）。
- 立即再同步一次：提示「新增 0 个，已存在 2201 个」。
- 工具栏风格筛选建议不出现零专辑风格；编辑框输入单字母时候选 ≤ 50 条且出现「还有 N 个匹配」提示。
- 限流/断网场景：中止提示可读、已写入部分有效、重跑正常收敛。

## 7. spec 同步点

- 新增 `openspec/specs/genre-library/spec.md`（新能力）：全量同步入口、增量写入约束、幂等、进度与统计、失败中止；`genre:library` 与 `album:filters` 的口径拆分；编辑框候选上限。
- `openspec/specs/manual-genre-edit/spec.md`：「从已有风格库选择添加标签」明确「已有风格库」= 本地风格库（含 MB 同步来的全量风格）；补「候选上限 50 条 + 还有 N 个匹配」scenario；「不支持创建新风格」措辞补充「MB 官方词表为标签唯一来源」。
- `openspec/specs/multi-genre-filter/spec.md`：「风格自动完成」补 scenario —— 建议列表只包含至少关联一张专辑的风格。
- `openspec/specs/local-storage/spec.md`：Genre 表字段增加 `mb_genre_id`（可空，MB 风格 UUID）+ 迁移 scenario；导出导入的兼容说明。
- README：「数据维护」条目补充「同步 MusicBrainz 风格库」。
