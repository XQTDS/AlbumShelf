## 1. 后端类型与接口定义

- [x] 1.1 在 `enrich-service.ts` 中新增 `MbFuzzyCandidate` 接口（含 mbid、mbTitle、mbArtist、score、releaseDate 字段）
- [x] 1.2 在 `enrich-service.ts` 中新增 `PendingMatch` 接口（含 albumId、albumTitle、albumArtist 及 MbFuzzyCandidate 的所有字段）
- [x] 1.3 修改 `enrichAll` / `reEnrichAll` / `enrichAlbumsWithoutGenres` 的返回类型，新增 `pending: number` 字段

## 2. 模糊查询策略实现

- [x] 2.1 新增辅助函数 `escapeRegex(str)` 用于转义正则特殊字符
- [x] 2.2 实现 `buildFuzzyQueries(title, artist)` 方法，包含 F1（去除艺术家名前缀）、F2（去除括号后缀）、F3（Lucene 分词搜索）三个子策略
- [x] 2.3 实现 `fuzzyMatchAlbum(title, artist, releaseDate)` 方法：调用 `buildFuzzyQueries` 构建查询，逐个尝试搜索 MB API，找到 score >= 50 的候选后用 `pickBestReleaseGroup` 选出最佳候选，返回 `MbFuzzyCandidate`（不调用 lookup）

## 3. 补全流程改造

- [x] 3.1 在 `EnrichService` 类上新增 `pendingMatches: PendingMatch[]` 实例属性
- [x] 3.2 修改 `enrichAlbum` 方法：精确匹配失败时调用 `fuzzyMatchAlbum`，模糊匹配成功则追加到 `pendingMatches` 且不标记 `enriched_at`，返回 `'fuzzy'` 状态；模糊匹配也失败则保持现有行为（标记 `enriched_at`）
- [x] 3.3 修改 `enrichAll` 方法：开始时清空 `pendingMatches`，统计 pending 数量，返回值增加 `pending` 字段
- [x] 3.4 同步修改 `reEnrichAll` 和 `enrichAlbumsWithoutGenres`：同样支持模糊匹配和 pending 统计

## 4. 确认与拒绝操作

- [x] 4.1 实现 `confirmMatch(albumId, mbid)` 方法：调用 MB lookup 获取 ratings 和 genres，写入数据库并标记 `enriched_at`，从 `pendingMatches` 中移除
- [x] 4.2 实现 `rejectMatch(albumId)` 方法：仅标记 `enriched_at`，从 `pendingMatches` 中移除
- [x] 4.3 实现 `getPendingMatches()` getter 方法：返回当前 `pendingMatches` 数组

## 5. IPC 层

- [x] 5.1 在 `ipc-handlers.ts` 中注册 `enrich:confirmMatch` handler，接收 `{ albumId, mbid }` 参数并调用 `enrichService.confirmMatch()`
- [x] 5.2 在 `ipc-handlers.ts` 中注册 `enrich:rejectMatch` handler，接收 `{ albumId }` 参数并调用 `enrichService.rejectMatch()`
- [x] 5.3 在 `ipc-handlers.ts` 中注册 `enrich:getPendingMatches` handler，返回 `enrichService.getPendingMatches()`
- [x] 5.4 修改现有 `enrich:start` / `enrich:reEnrichAll` / `enrich:enrichAlbumsWithoutGenres` handler 的返回值，传递 `pending` 字段

## 6. Preload 桥接层

- [x] 6.1 在 `preload/index.ts` 中新增 `enrichConfirmMatch(albumId, mbid)` API
- [x] 6.2 在 `preload/index.ts` 中新增 `enrichRejectMatch(albumId)` API
- [x] 6.3 在 `preload/index.ts` 中新增 `enrichGetPendingMatches()` API
- [x] 6.4 更新 `preload/index.d.ts` 类型定义

## 7. 前端 UI

- [x] 7.1 改造 `FuzzyMatchModal.vue`：将 `FuzzyMatch` 接口替换为 `PendingMatch` 数据结构（albumId、mbid 替代 neteaseId），展示本地标题 vs MB 标题对比、MB 艺术家信用和 score
- [x] 7.2 改造 `FuzzyMatchModal.vue` 的确认逻辑：确认调用 `enrichConfirmMatch`，关闭时对未选中项调用 `enrichRejectMatch`
- [x] 7.3 在 `App.vue` 中：补全完成后检测 `pending > 0`，调用 `enrichGetPendingMatches()` 获取数据并弹出 `FuzzyMatchModal`
- [x] 7.4 在 `App.vue` 中：确认完成后刷新专辑列表和筛选器，显示成功提示
