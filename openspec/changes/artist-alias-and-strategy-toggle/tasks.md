## 1. 新增基础模块

- [x] 1.1 创建 `artist-aliases.json` 初始文件（空对象 `{}`），放在 `album-shelf/src/main/enrich/` 目录下
- [x] 1.2 创建 `artist-alias.ts` 模块：实现 `loadAliases()`（从 JSON 文件加载为 Map）、`getAliases(artist)`（查找别名，无则返回空数组）、`addAlias(artist, alias)`（去重追加并同步写回文件）
- [x] 1.3 创建 `settings.ts` 模块：实现 `loadSettings()`（从 userData/settings.json 读取，文件不存在则返回默认值）、`saveSettings()`（写入文件）、`getEnrichStrategies()`（返回 6 个策略开关状态，缺失项默认为 true）

## 2. 改造查询构建

- [x] 2.1 改造 `buildSearchQueries(title, artist)`：读取策略开关和别名列表，按 B-2 优先级（同策略内先原名后别名）生成查询；Q1/Q2/Q3 各自受对应开关控制，关闭则跳过
- [x] 2.2 改造 `buildFuzzyQueries(title, artist)`：同上逻辑，F1/F2/F3 各自受对应开关控制，每个策略内先原名后别名

## 3. 改造补全流程（逐条确认）

- [x] 3.1 修改 `enrichAlbum()` 签名：新增 `onFuzzyMatch` 回调参数（`(album, candidates) => Promise<{mbid: string} | null>`），移除 `'fuzzy'` 返回值，改为在回调中处理确认/拒绝
- [x] 3.2 在 `enrichAlbum()` 中实现逐条确认逻辑：模糊匹配有候选时调用 `onFuzzyMatch` 等待用户回复，确认则调用 `confirmMatch()` 并返回 `'matched'`，拒绝则标记 `enriched_at` 并返回 `'failed'`
- [x] 3.3 在 `enrichAlbum()` 的确认逻辑中新增自动别名学习：比较本地 artist（多艺术家取第一个）与候选的 `mbArtist`，忽略大小写和首尾空格后若不同，调用 `addAlias()` 追加
- [x] 3.4 修改 `enrichAll()` / `reEnrichAll()` / `enrichAlbumsWithoutGenres()` 签名：新增 `onFuzzyMatch` 参数，透传给 `enrichAlbum()`
- [x] 3.5 移除 `_pendingMatches` 数组、`getPendingMatches()` 方法、`confirmMatch()` 和 `rejectMatch()` 方法（确认逻辑内联到 `enrichAlbum` 中）
- [x] 3.6 修改 `EnrichResult` 接口：移除 `pending` 字段（所有模糊匹配已在过程中处理完毕），新增 `confirmed` 字段记录用户确认的数量

## 4. 改造 IPC 层

- [x] 4.1 修改 `enrich:start` / `enrich:reEnrichAll` / `enrich:enrichAlbumsWithoutGenres` handler：构建 `onFuzzyMatch` 回调，通过 `mainWindow.webContents.send('enrich:fuzzy-confirm-request', ...)` 发送候选到前端，通过 `ipcMain.once` 监听前端回复
- [x] 4.2 移除 `enrich:confirmMatch`、`enrich:rejectMatch`、`enrich:getPendingMatches` IPC handler
- [x] 4.3 在 preload 层新增 `onFuzzyConfirmRequest` 监听和 `sendFuzzyConfirmReply` 发送的 API 定义

## 5. 改造前端

- [x] 5.1 改造 `FuzzyMatchModal.vue`：从批量列表确认改为单条确认模式，监听 `enrich:fuzzy-confirm-request` 事件弹出，用户选择/拒绝后通过 `sendFuzzyConfirmReply` 回传结果
- [x] 5.2 更新 `App.vue` 中补全完成后的结果处理逻辑：适配新的 `EnrichResult` 接口（无 `pending`，新增 `confirmed`），移除批量确认弹窗的触发逻辑
