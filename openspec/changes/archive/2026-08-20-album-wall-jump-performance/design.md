# 设计：唱片墙快速跳转性能优化

## Context

唱片墙/表格视图由 App.vue 内联渲染，数据经 `album:list` IPC → `AlbumService.queryAlbums`（better-sqlite3，LIKE 搜索 + LIMIT/OFFSET 分页 + 逐行附加风格）。跳转定位（`fetchAlbumsAndScrollTo`）逐页顺序加载是卡顿主因；清空搜索后仅有第 1 页导致深拖底部需要反复触发逐页加载。

## Goals / Non-Goals

见 proposal.md 目标与非目标。

## Decisions

### 决策 1：`album:list` 新增 `fetchAll` 模式（单次 IPC 返回完整结果集）

- **理由**：better-sqlite3 全表扫描 2,454 行仅毫秒级，JSON 载荷 ~1.5MB，本地 IPC 传输 ~30-80ms；将 62 轮往返 + 62 次递增重渲染压缩为一次。
- **备选方案**：主进程内循环分页聚合（多一次跨层通信、无收益）；`album:position` COUNT 定位查询（方案 C，SQLite OFFSET 大页码退化、需双向哨兵，复杂度高）。
- **实现**：`AlbumQueryOptions.fetchAll?: boolean`。`queryAlbums` 中 `fetchAll` 时跳过 `LIMIT/OFFSET`（保留 COUNT 供 total/hasMore 使用），返回 `page:1, pageSize:total, totalPages:1`。IPC handler 透传无需改动。同时修正 preload 既有类型漂移 `genre` → `genres`（运行时本就传 `genres`）。

### 决策 2：跳转路径统一走 fetchAll

- **理由**：`fetchAlbumsAndScrollTo` 的所有调用方（清除流派/艺术家筛选、随机选、播放条封面点击）语义都是"定位到某专辑"，目标可能位于任意深度，逐页加载必然退化。
- **实现**：`fetchAlbumsAndScrollTo` 重写为单次 `albumList({...buildAlbumQueryOptions(), fetchAll: true})` → `applyFullResult` → `nextTick` → `scrollToAlbumRow`。调用方无需改动。`resetAndFetch(scrollToAlbumId)` 保留（预清空列表 + 有目标时走新路径）。

### 决策 3：深拖滚动进度条到底时按比例补拉全量

- **理由**：清空搜索/冷启动后仅有第 1 页，进度条 `seek`（绝对 scrollTop）只能落在已加载内容内；补拉全量后按相同**比例**重设位置，保持用户拖拽意图。
- **实现**：`handleScrollSeek` 中当 `hasMore && !loadingAll && scrollTop >= maxScroll - 200` 时记录 `ratio = scrollTop/maxScroll` → fetchAll → `nextTick` → `scrollTop = min(newMax, ratio*newMax)`。`loadMore` 与 IntersectionObserver 回调增加 `!loadingAll` 守卫防竞态。

### 决策 4：清空搜索保持选中并定位

- **理由**：与清除流派/艺术家筛选的既有行为一致；消除"清空搜索后选中态丢失、面板收起"的意外。用户已确认。
- **实现**：`clearSearch` 与 `debouncedSearch`（清空到空串分支）在 `selectedAlbumId` 存在时 `resetAndFetch(selectedAlbumId.value)`，否则维持回到顶部第 1 页。顺带 `toggleViewMode` 切换视图时同样定位保持选中。

### 决策 5：`content-visibility: auto` + `contain-intrinsic-size: auto <len>`

- **理由**：全量渲染时浏览器跳过离屏卡片的布局/绘制，视口外成本趋零；`auto <len>` 让浏览器记忆真实尺寸，避免滚动坍塌抖动。网格卡片 `aspect-ratio:1/1` 且列宽由容器决定，行高确定；表格行高固定（nowrap 标题 + 固定 padding）。
- **备选方案**：`contain: strict`——会破坏卡片 hover/选中 `transform: scale` 的绘制（裁剪溢出），不用。`v-memo` 只减 vnode diff，不减绘制；两者互补。
- **实现**：`.album-card` 加 `content-visibility:auto; contain-intrinsic-size:auto 160px`；`.album-table tbody tr.album-row` 加 `content-visibility:auto; contain-intrinsic-size:auto 43px`。**风险**：Chromium 对 `<tr>` 的 content-visibility 有已知怪癖，QA 异常时仅移除表格行规则。

### 决策 6：封面 `loading="lazy"` + `decoding="async"`

- **理由**：fetchAll 后 2,454 张封面若急切加载会洪水式请求 cover://；懒加载后仅视口附近加载（Chromium 在程序化滚动后加载视口+边距内图片），且 `cover://` 本地缓存命中率高。
- **实现**：网格卡片 `<img>` 增加两个属性；封面失败回退链（cover:// → 远程 URL → 占位图）不变。

### 决策 7：`v-memo` 字段级依赖

- **理由**：分页追加、选中/播放状态变化等触发整列表 vnode diff 的主因是每张卡片重新执行渲染函数；`v-memo` 缓存依赖未变的卡片子树。**必须字段级依赖**：`toggleMedia`/`setRating`/`setGenres` 均原地变更 album 对象字段，对象引用不变。
- **实现**：
  - 网格卡片：`[album.title, album.artist, album.cover_url, album.physical_media, album.user_rating, album.mb_rating, album.release_date, album.genres, sortBy, sortOrder, selectedAlbumId, playingAlbumId, coverErrorSet.has(album.id), coverProtocolFailed.has(album.id)]`
  - 表格行：`[index, album.title, album.artist, album.user_rating, album.physical_media, album.mb_rating, album.release_date, album.genres, selectedAlbumId, playingAlbumId, selectedGenres]`
- **取舍**：选中/播放变化仍会触发全列表重渲染（依赖含全局状态），与现状一致、无回归；分页追加与滚动是本次收益主体。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|---|---|
| 10k 上限时全量渲染（~60-80k DOM 节点） | 冷启动/搜索仍分页；仅跳转/深拖触发全量；content-visibility 限布局绘制、懒加载限内存；若 10k 实测卡顿则升级虚拟滚动（网格几何均匀，抽取容易） |
| `content-visibility` 在 `<tr>` 上的 Chromium 怪癖 | QA 验证；异常则仅移除表格行规则（表格行无图、成本低） |
| `v-memo` 字段遗漏导致原地变更不刷新 | 依赖已覆盖 rating/media/genres/cover/selected/playing；QA 验证评分、介质、风格编辑后卡片/行同步更新 |
| 哨兵 `loadMore` 与进行中的 fetch-all 竞态 | `loadingAll` 守卫（loadMore/observer/seek 三处）；fetch-all 完成后原子替换 `albums` |
| 跳转目标不在结果集中（如移除筛选后不再匹配） | `scrollToAlbumRow` 静默 no-op，面板自然收起（与既有行为一致） |

## 代码改动

- `album-shelf/src/main/album-service.ts` — `AlbumQueryOptions.fetchAll`；`queryAlbums` 分支跳过 LIMIT/OFFSET
- `album-shelf/src/preload/index.ts`、`index.d.ts` — `fetchAll?: boolean`；`genre` → `genres` 类型修正
- `album-shelf/src/renderer/src/App.vue`
  - 新增 `buildAlbumQueryOptions()` / `applyFullResult()` / `loadingAll` ref
  - 重写 `fetchAlbumsAndScrollTo`（单次 fetchAll）
  - `handleScrollSeek` 深拖到底补拉全量（比例重定位）
  - `clearSearch` / `debouncedSearch` / `toggleViewMode` 保持选中
  - 网格卡片与表格行 `v-memo`；封面 `<img loading="lazy" decoding="async">`
  - `.album-card` / `.album-row` `content-visibility` CSS
