# 设计

## 现状与约束

- 专辑的艺术家真源是 `album.artists` 结构化 JSON（`[{name, originalId, id}]`），`album.artist` 只是 `' / '` 拼接的展示文本；解析统一走 [album-artist.ts](../../../album-shelf/src/main/album-artist.ts) 的 `albumArtistRefs`（结构化优先，NULL/损坏回退文本拆分）。
- `artist` 表只为主艺人建行：启动迁移 `ensureNeteaseArtistIdentity` 只解析 `album.artists[0].originalId`（[database.ts](../../../album-shelf/src/main/database.ts)）。合作艺人、只在别人专辑中出现且没有主艺人行的艺人不会进入 `artist` 表。
- 本机当前库只读统计（2026-11-17）：
  - 2621 张专辑，2810 条艺人署名引用，1707 个身份桶（按唯一同名规则合并后约 1706 个显示条目）；
  - `artist` 表 1721 行，其中 140 行没有网易云 ID；
  - 126 位艺人只以合作者身份出现、且没有 `artist` 行；
  - 1150 / 1707（67%）的艺人身份有地区；
  - 574 张专辑有我的评分，379 位艺人有至少 1 张已评分专辑；
  - 425 张专辑没有 MBID，292 个艺人身份没有任何 MB 匹配专辑；
  - 3 组同名不同 ID（MONO、Ground-Zero、home alone.），1 个 `originalId = 0` 哨兵值；
  - 单艺人最多 15 张专辑。
- 现有独立窗口先例：关注列表 `createFollowedWindow`（[index.ts](../../../album-shelf/src/main/index.ts)），多页面入口在 [electron.vite.config.ts](../../../album-shelf/electron.vite.config.ts)。
- 现有跳转先例：随机选择 / 播放条封面点击的「清筛选 + fetchAll + scrollToAlbumRow + 选中」（[App.vue](../../../album-shelf/src/renderer/src/App.vue)）。
- 现有定位约束：`selectedAlbum` 只从当前 `albums` 数组计算；目标不在列表时单独设置 `selectedAlbumId` 会静默失败。

## 关键决策

### 1. 艺人目录从专辑派生，不从 artist 表直出

`ArtistBrowserService` 每次调用扫描 `album` 表：

```sql
SELECT id, title, cover_url, release_date, user_rating, artist, artists
FROM album
```

逐行 `albumArtistRefs` 展开，按身份键聚合。`artist` 表只用于按 `netease_artist_id` 补充规范名、加密 ID、地区字段。理由：

- 覆盖只在合作位置出现的艺人；
- 同步删除专辑后自动收敛，不会列出 0 专辑的 artist 孤儿行；
- 不依赖 artist 行是否已由迁移创建；
- 当前 2.6k 专辑规模下 JS 扫描为毫秒级，和现有筛选/关注列表同一先例。

不新增 `album_artist` 正规化表，不做统计缓存；库到万级以上再评估。

### 2. 身份键与归并

```
originalId > 0        → netease:<originalId>
否则加密 ID 非空       → encrypted:<id>
否则                  → name:<trim(name)>
```

规则：

- 同一专辑内同一身份只计一次。
- 同一 ID 在多个专辑出现不同名字：合并，展示名优先 `artist.name`，其次出现次数最多的名字；其余名字进入 `alias_names`（例如 ID 14402）。
- 同名不同 ID：**分列**，不合并（MONO / Ground-Zero）。
- 无 ID 的名字桶：仅当该名字只对应唯一一个 ID 桶时合并进去（home alone.）；有歧义则保留独立行。
- `originalId = 0` 视为无效哨兵，走加密 ID/名字回退；仅有加密 ID 的桶也按「唯一同名 netease 桶」规则合并进去（home alone. 的 ID 0 专辑会归入 94996060）。
- 合成艺人：网易云 ID 122455（群星）、104700（Various Artists），或名字命中 `region.ts` 的合成名集合；摘要返回 `is_synthetic = true`，UI 显示「群星/合辑」标记并排在真人之后（同专辑数时）。

### 3. 统计口径

- `album_count`：该身份出现的 **distinct album** 数，任意 artists 成员都算（any-credit）；合作专辑计入每位参与者。
- `primary_album_count`：该身份是 `artists[0]` 的专辑数；`album_count - primary_album_count` 为参与作品数。
- `average_rating`：该艺人全部专辑中 `user_rating IS NOT NULL` 的算术平均，保留 1 位小数；`rated_album_count` 同时返回。
- 0 张已评：`average_rating = null`，UI 显示「—」，**不把未评分当 0**。
- 不与 `mb_rating` 混算；v1 不展示 MB 均分。
- 专辑列表与 `album_count` 使用同一 predicate，条数必须一致。

### 4. 地区读取与手动编辑

**读取**：仅按 `netease_artist_id` 查 `artist` 行，取 `region` / `area` / `region_source`。不按名字回退、不使用旧 `primary_artist_mbid` 兜底。无行或 `region` 为空显示「—」。

**手动编辑**（本 change 唯一写操作）：

```sql
ALTER TABLE artist ADD COLUMN region_source TEXT
```

- `NULL` = 自动/MB 来源；`'manual'` = 用户手动设置或手动清除。
- 手动写入同时覆盖 `region`、`country`，并清空 `area`（避免旧 MB area 与手动地区矛盾）：
  - 设置地区：`region = <ISO alpha-2>`, `country = <同 code>`, `area = NULL`
  - 清除地区：`region = NULL`, `country = NULL`, `area = NULL`
  - 两种情况都写 `region_source = 'manual'`。
- 若艺人尚无 `artist` 行（126 位仅合作艺人），按 `netease_artist_id` INSERT 一行，名称/加密 ID 来自当前目录摘要。
- 没有网易云 ID 的 `name:` / `encrypted:` 身份：UI 禁用编辑；主进程拒绝并返回明确错误。
- 手动地区写入 `artist.region`，因此专辑地区 chip、地区筛选项 `getUsedRegions` 自动生效，无需改 `ALBUM_SELECT_WITH_REGION`。

**自动补全保护**：

- `ArtistService.upsertArtist` 三个写入分支：若目标行 `region_source = 'manual'`，SHALL NOT 更新 `region` / `country` / `area` / `region_source`。
- `ensureNeteaseArtistIdentity` 的 `mergeNeteaseIntoMbid` / `fillRegion`：手动行优先；合并时若源行是 manual，目标行继承 manual 与地区值（包括 NULL）。
- `importDatabase`：manual 来源优先于自动来源；目标行已有 manual 时不被入站自动行覆盖；入站 manual 可填充目标自动/空行。
- `getUsedRegions` / 专辑查询无需改动：它们读 `artist.region`。

**清除语义**：手动清除后 `region = NULL, region_source = 'manual'`，自动补全仍不得回填；UI 显示「—」并保留「手动」标识。

### 5. 窗口与 UI

独立 BrowserWindow，仿关注列表：

- 菜单「工具 → 艺人信息」，单实例，已打开则聚焦；
- 默认 900×660，最小 720×520；
- 隐藏菜单栏，Esc 关闭；`setWindowOpenHandler` 外链走系统浏览器；
- 多页面入口：`artists.html` + `artists-main.ts` + `ArtistBrowserWindow.vue`；
- 默认 session 的 CSP 与 `cover://` 协议自动继承，无需重复注册。

布局：

```
┌ 工具条：搜索艺人… | 排序：专辑数/名字/平均评分 | 共 N 位 · 命中 M 位 ┐
├ 左栏 250px：艺人行（名字 / 地区 chip / N 张 / ★均值(M 张已评)） ┤
│ 右栏：艺人头部（名字、地区 chip + 编辑、专辑数、平均分、手动标识）   │
│       专辑行（cover:// 封面、专辑名、我的星级+数值、发行日期、合作标记）│
└──────────────────────────────────────────────────────────────────┘
```

- 左栏行用 `<button>`/`role="button"`，支持键盘；选中态高亮；`content-visibility: auto`。
- 搜索在渲染层本地过滤（名字与别名）；排序本地进行：专辑数降序（默认）/ 名字 / 平均评分降序（无评分最后）。
- 艺人行点击只在本窗口选中详情，**不关窗、不筛选主界面**。
- 专辑行整行可点；封面三级回退：`cover://album/<id>` → 远程 `cover_url` → 💿 占位。
- 未评分显示「—」；地区缺失显示「—」；`region_source = 'manual'` 显示「手动」小标识，title 说明自动补全不会覆盖。
- 地区编辑：头部地区 chip 旁铅笔按钮 → 弹窗（搜索 + 地区列表 + 清除 + 取消/保存）。地区选项由主进程生成：标准 ISO alpha-2 列表 + 库中已有地区，标签复用 `regionLabel`。
- 空态：库内无专辑（引导先同步）、搜索无结果、加载失败+重试、目标专辑已删除提示。
- 刷新：打开时加载；窗口 focus 时静默重拉（保留搜索词、选中艺人、滚动位置尽量保持）；提供手动刷新按钮。

### 6. 跳转主界面专辑详情

新增 IPC `artistBrowser:openAlbum(albumId)`：

1. 主进程校验专辑存在；
2. 取 `getMainWindow()`；不存在返回「主窗口不可用」；
3. `restore()`（最小化时）/ `show()` / `focus()` / `moveTop()`；
4. `webContents.send('artistBrowser:openAlbum', albumId)`；
5. 艺人窗口保持打开。

主窗口 `App.vue`：

- 目标已在当前 `albums`：设置 `selectedAlbumId` + `scrollToAlbumRow`，不改任何筛选。
- 不在当前列表：取消搜索防抖，清空所有影响结果集包含性的条件——`searchQuery`、`selectedArtist`/`artistInput`、`artistPartial`、`selectedGenres`/`genreInput`、`selectedRegion`、`followedOnly`；保留 `viewMode`、排序、角标开关、播放状态；`selectedAlbumId = null` 取消旧风格编辑态；`fetchAll` 全量加载；确认目标存在后选中并滚动。
- 目标不存在：提示「该专辑已不在库中（可能已被同步删除）」，不设置选中；艺人窗口收到失败后刷新列表。
- 提取 `clearAllListFiltersForJump()`，顺带修正既有 `handlePlayerCoverClick` 漏清 `artistPartial`/`followedOnly`、`handleRandomPick` 漏清 `followedOnly` 的问题。
- `fetchAlbumsAndScrollTo` 改为返回 `Promise<boolean>`，供调用方判断是否定位成功。

### 7. IPC / preload 契约

```ts
artistBrowser:list        → IpcResult<ArtistBrowserSummary[]>
artistBrowser:albums      → IpcResult<ArtistBrowserAlbum[]>       // 参数 key
artistBrowser:regionOptions → IpcResult<{ key: string; label: string }[]>
artistBrowser:setRegion   → IpcResult<ArtistBrowserSummary>       // { key, name, neteaseArtistId, encryptedId, region }
artistBrowser:openAlbum   → IpcResult<{ albumId: number }>
artistBrowser:closeWindow → send（按 sender 关窗）
artist-region:changed     → 主进程广播 { neteaseArtistId, region, regionLabel }
artistBrowser:openAlbum   → 主进程转发给主窗口（同名事件，方向不同）
```

preload 暴露 `artistBrowserList` / `artistBrowserAlbums` / `artistBrowserRegionOptions` / `artistBrowserSetRegion` / `artistBrowserOpenAlbum` / `artistBrowserCloseWindow` / `onArtistBrowserOpenAlbum` / `onArtistRegionChanged`。渲染层 tsconfig 不包含 preload 全局类型，窗口组件内本地声明 interface。

### 8. 数据结构

```ts
export interface ArtistBrowserSummary {
  key: string
  netease_artist_id: number | null
  netease_encrypted_id: string | null
  name: string
  alias_names: string[]
  region: string | null
  region_label: string | null
  region_area: string | null
  region_source: 'manual' | null
  album_count: number
  primary_album_count: number
  rated_album_count: number
  average_rating: number | null
  is_synthetic: boolean
}

export interface ArtistBrowserAlbum {
  id: number
  title: string
  cover_url: string | null
  user_rating: number | null
  release_date: string | null
  is_primary: boolean
  artist_text: string
}
```

### 9. 导出 / 导入 version 5

- `artist` 行新增 `region_source`；`exportDatabase` 的 `SELECT *` 自动带出。
- `ExportData.version` 升为 5；`ImportData` 接受 1–5；旧版 v1–v4 无该字段按 NULL（自动来源）处理。
- 导入 artist 时 manual 优先级：
  - 目标行 manual → 保留目标；
  - 否则入站 manual → 写入入站 region/country/area/source；
  - 否则沿用现有 `COALESCE` 语义。
- 导入结束后 `ensureNeteaseArtistIdentity` 必须遵守 manual 保护。
- 导入旧版 v1–v3 文件时，album UPDATE 的 `artists` 使用 `COALESCE(?, artists)`，避免把库中已有结构化 JSON 覆盖为 NULL（否则艺人目录退化为文本拆分）。
- README 数据存储章节把 version 4 更新为 5，说明 `region_source`。

### 10. 主窗口地区同步

`artist-region:changed` 广播后，`App.vue`：

- 将当前 `albums` 中 `primary_artist_id === neteaseArtistId` 的行更新为新的 `region` / `region_label`（`region_area = null`）；
- 重新 `fetchFilters()` 刷新地区筛选项；
- 若当前有地区筛选，`fetchFilters` 可能自动清除失效地区并重载；否则无需重载列表。
- 艺人窗口自身保存成功后直接用返回的 summary 更新界面，不依赖广播。

## 风险与验证点

1. **同名不同 ID**：必须分列；用地区/专辑数/ID tooltip 区分，不能按名字合并。
2. **`originalId = 0`**：按无效处理，避免多个未知艺人并桶；当前库 `home alone.` 通过唯一同名规则并入 94996060。
3. **仅合作艺人无地区**：126 位显示「—」，是数据限制；扩展地区解析另开 change。
4. **平均分覆盖率低**：78% 艺人无评分；必须显示「已评 N 张」，否则均值误导。
5. **手动地区与自动补全冲突**：所有 artist 写入路径都必须尊重 `region_source = 'manual'`，用固定数据集验证「重新补全所有专辑」后手动值不变、手动清除后仍为空。
6. **导出 v5 兼容**：v4 及更早文件可导入；v5 往返一致；旧版本应用会因版本校验拒绝 v5 文件（不承诺向前兼容）。
7. **跳转竞态**：连续点击不同专辑时，用请求序号/最新请求校验避免旧 fetchAll 覆盖新选中；清空搜索时取消 300ms 防抖。
8. **主窗口生命周期**：最小化时 restore/show/focus；主窗口不存在时明确报错；顺手把 `app.on('activate')` 改为 `!getMainWindow()` 时重建主窗口。
9. **生产构建**：新增 renderer 入口必须在 `electron.vite.config.ts` 注册，构建后检查 `out/renderer/artists.html` 存在。
10. **无障碍**：行用 button/role + Enter/Space；地区弹窗 Esc 优先关闭弹窗，再关闭窗口。
11. **性能**：当前 2621 专辑一次扫描可接受；1707 行列表用 `content-visibility`，不做虚拟滚动；万级再评估。
12. **旧备份 `artists` 为 NULL**：文本拆分可能拆碎含 `/` 名字；UI 按名字回退并禁用地区编辑（无 ID），不阻塞主流程。
13. **未评分与 0 分**：`user_rating` 合法值 0.5–5.0，NULL 才是未评分；不要用 `?? 0`。
14. **手写 SQL 的 manual 保护**：`upsertArtist` 三个分支、`ensureNeteaseArtistIdentity` 两个 merge 分支、`importDatabase` 三个 upsert 分支都要覆盖，避免漏一处导致手动值被覆盖。