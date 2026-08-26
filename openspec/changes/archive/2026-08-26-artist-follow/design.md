# 设计

## 现状

- 艺术家不是一级实体：`album.artist` 为 `/` 拼接文本（同步链路 `join('/')`，在线搜索添加 `join(' / ')`，两种分隔并存），`track.artist` 同理；artistId 在 `toNeteaseAlbum` 映射时被丢弃
- 艺术家 UI 为纯文本不可点击（表格列 / 唱片墙卡片 / 详情面板三处），唯一交互是工具栏艺术家筛选自动补全（`getAllArtists` 返回完整字符串，精确等值筛选）
- 交互链路先例：乐观更新（`handleSetRating`）→ IPC → service → SQLite；批量回填先例：封面/发行日期回填（防重入 + 进度事件 + 限流）
- ncm-cli 0.1.6 探测结论（2026-08-26 实测）：
  - `ncm-cli artist songs --artistId <加密ID> --startTime --endTime --limit --offset`：艺人歌曲列表，**参数要求加密艺人 ID**（32 位 hex）
  - `ncm-cli search all --keyword <词>`：综合搜索，返回 `artists` 数组，含 `originalId` + `id`（加密）+ `name` + `coverImgUrl`
  - 无 `search artist` 子命令；`artist` 族仅 `songs` 一个子命令
  - 结论：要支持后续「按 artistId 拉数据」，**明文与加密 ID 都需要落库**

## 改动

### 数据模型

```sql
CREATE TABLE IF NOT EXISTS followed_artist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  original_id INTEGER,              -- 网易云明文艺术家 ID（可空，回填/搜索时补充）
  encrypted_id TEXT,                -- 网易云加密艺术家 ID（可空，ncm-cli artist songs 参数用）
  followed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`album` 新增列（迁移样板同 `physical_media`）：

```sql
ALTER TABLE album ADD COLUMN artist_ids TEXT
```

`artist_ids` 内容为 JSON 数组 `[{"originalId":3684,"id":"457D..."}, ...]`，下标与 `artist` 文本按 `split(/\s*\/\s*/)` 拆出的名字顺序对齐；写入点（同步映射 / 在线添加）都从同一个 `artists` 数组同时产出名字串与 ID 数组，对齐在写入时天然成立。NULL 表示未知。

导出导入：`ExportData.version` → 2，`data.followedArtists`；import 兼容 v1（缺省处理），v2 往返一致。

### 服务层

`FollowedArtistService`（新文件，对齐 track-service 结构）：
- `follow(name, ids?)`：trim 后 upsert；已存在时仅用 COALESCE 补 ID 字段
- `unfollow(name)` / `isFollowed(name)` / `getFollowedNames()` / `list()`（含 album_count：一次 `SELECT id, artist FROM album` 全表扫描在 JS 里按拆分统计）

`queryAlbums` 新增选项（`followedOnly` / `artistPartial`）：JS 预计算命中专辑 id 集合 → `a.id IN (@aid0…)` 条件（named params，不混用 positional）。库规模约千级，全表扫描 + split 微秒级；注释注明万级演进路径（LIKE-OR 或 album_artist 正规化表）。

### 同步链路

- `NeteaseAlbum` 增加 `artist_ids?: { originalId: number; id: string }[]`
- `toNeteaseAlbum`：`artist_ids: record.artists.map(a => ({ originalId: a.originalId, id: a.id }))`
- `sync-manager` 构造 `AlbumInsert` 时透传；`syncSingleAlbum`（在线添加路径）同样透传
- 已存在专辑不更新（保持不变量），存量 ID 由回填任务补：`getAlbumsWithoutArtistIds()` + `album:artistIdFillStart`（`album get` 的 `detail.artists` → `updateAlbum` 只填 NULL 列）

### UI

- 共享拆分助手（主进程/渲染层同语义）：`split(/\s*\/\s*/).map(trim).filter(Boolean)`
- 艺术家展示：**仅详情面板**渲染为芯片组（长名芯片内换行不截断），芯片点击打开共享 `ArtistActionPopover`（fixed 定位 + backdrop/Esc/滚动关闭，不锚定跟随）；表格列与唱片墙遮罩为纯文本（已关注艺术家名以金色文字标识，不可点击，避免列表拥挤），唱片墙卡片右上角 ★ 角标标识含已关注艺术家的专辑
- `followedArtists: ref<Set<string>>` 状态（变更整体替换新 Set 触发响应式），onMounted 加载，失败静默降级
- 工具栏「★ 已关注 (n)」开关 → `followedOnly`；关注列表管理入口为菜单「工具 → 关注列表」→ **独立窗口**（多页面渲染入口 `followed.html`/`followed-main.ts`/`FollowedArtistsWindow.vue`，单实例聚焦，行点击转发 `followed:filterArtist` 到主窗口应用 `artistPartial` 筛选并关闭自身，隐藏菜单栏）
- 跨窗口定位：新增 `window-ref.ts` 显式登记主窗口（`setMainWindow`/`getMainWindow`）。Electron 不保证 `getAllWindows()` 顺序，多窗口场景下事件转发/对话框挂载不得依赖 `getAllWindows()[0]`
- 回填进度：`artistIdFillStart` 进度事件 + 渲染层 `artistIdFillProgress` 进度条（与封面/发行日期回填同款展示）；回填完成后 `fillMissingIdsFromAlbums()` 按名字匹配 `album.artist_ids` 为缺 ID 的关注记录补齐 ID（COALESCE 只补缺失字段），结果含 `idsMerged` 计数并提示
- **v-memo 依赖数组必须加 `followedArtists`**（表格行 L219、卡片 ~L346），否则关注状态不刷新

### 交互演进记录（实现后用户反馈迭代）

1. 关注列表从「主界面 📋 按钮 + 弹窗」改为「菜单入口 + 独立窗口」（主界面不放按钮，窗口无菜单栏）
2. 表格/唱片墙芯片改为纯文本 + 金色文字标识（芯片太拥挤，点击操作仅保留在详情面板）
3. 关注列表窗口点击艺术家不筛选主界面的 bug：根因 `getAllWindows()[0]` 不保证是主窗口，用 `window-ref.ts` 修复

## 风险与验证点

1. 分隔符不统一（`'/'` vs `' / '`）：拆分统一 `/\s*\/\s*/`；验证在线添加的专辑关注/筛选正常
2. 对齐：ID 与名字对齐只由「同一数组同时产出」保证；回填路径只填 ID 不碰文本，若用户手动改过 artist 文本，顺序可能错位（未来按 name 兜底）
3. 同步不更新已存在专辑：新列只对新增生效，老库靠回填；验证同步后新增有值、已存在为 NULL
4. 含 `/` 的艺术家名会被拆分（与既有筛选粒度一致，接受）
5. v-memo：不加 `followedArtists` 星标不刷新
6. better-sqlite3 named params 不可混用 positional
7. 导出导入：v1 文件可导入，v2 含 followedArtists 往返一致
8. 回填并发：复用 coverFill 防重入 + 300ms 限流模式
9. 多窗口定位：`BrowserWindow.getAllWindows()` 顺序无保证，主窗口事件转发/对话框挂载必须走 `window-ref.ts`（关注列表窗口打开后复现过转发丢失）
