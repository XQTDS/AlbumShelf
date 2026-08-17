# 设计：NcmCliSyncService 收藏专辑同步

## 1. 数据流

```
用户点击同步
  → sync:start IPC
  → SyncManager.sync()
  → NcmCliSyncService.fetchCollectedAlbums()
      → NcmCliService.getCollectedAlbumsPage(50, offset) × N 页（直到空页）
      → 映射为 NeteaseAlbum[]
  → SyncManager 按 netease_album_id 增量去重：
      已存在 → skipped++（不修改数据库）
      不存在 → 批量插入
  → 返回 {added, skipped, total}
```

## 2. NcmCliService 扩展

新增一个方法（复用现有 `execute<T>()` 通用调用与 15s 超时）：

```ts
getCollectedAlbumsPage(limit: number, offset: number): Promise<NcmCliCollectedAlbumResponse>
// 执行: ncm-cli album collected --limit <limit> --offset <offset>
```

返回类型与 `NcmCliAlbumSearchResult` 同构，新增独立接口 `NcmCliCollectedAlbum` / `NcmCliCollectedAlbumResponse` 以明确语义。

## 3. NcmCliSyncService 实现

- `fetchCollectedAlbums(): Promise<NeteaseAlbum[]>`
  - 每页固定 `limit=50`，`offset` 步进 50
  - 翻页终止条件：**返回空 records 数组**（实测 `recordCount` 恒为 0，不可信；单页可能少于 50 条，不可用 `length < limit` 判断）
  - 单页失败重试 2 次（间隔 1s），仍失败则抛出错误中止同步
  - 安全上限 200 页（10000 张），超出记警告并停止
  - 映射规则：
    - `netease_album_id` = `record.id`（加密 ID）
    - `netease_original_id` = `record.originalId`
    - `title` = `record.name`
    - `artist` = `artists.map(a => a.name).join('/')`（与现有约定一致）
    - `cover_url` = `record.coverImgUrl`
    - `release_date` = `publishTime` 毫秒时间戳 → ISO 日期
    - `track_count` = undefined（接口不返回）
- `checkLoginStatus()`：复用 `NcmCliService.getLoginStatus()`（已实现）

## 4. SyncService 接口瘦身

- 删除 `FuzzyMatchAlbum`、`SyncFetchResult` 类型
- `fetchCollectedAlbums()` 返回值改为 `Promise<NeteaseAlbum[]>`
- 收藏列表接口直接返回真实 ID，不再存在模糊匹配场景

## 5. SyncManager 改造

- 删除 CSV 回写（`writeNeteaseIdsToCsv`）与 `confirmFuzzyMatches()`（含 `updateAlbumTitleInCsv`）
- `addAlbumToCollection()` 去掉 `appendAlbumToCsv`，仅 `syncSingleAlbum`
- 保留既有增量去重行为：已存在专辑仅 `skipped++`，**不更新数据库任何字段**

## 6. 删除与清理

- 删除文件：`sync/csv-reader.ts`、`sync/csv-writer.ts`、`sync/mock-sync-service.ts`
- `ipc-handlers.ts`：注入点切换为 `NcmCliSyncService`；删除 `sync:confirmFuzzyMatches` handler；`album:fixId` 中移除 CSV 回写步骤
- `preload/index.ts`：删除 `ConfirmedFuzzyMatch` 与 `syncConfirmFuzzyMatches`
- `App.vue`：同步结果解构中移除 `fuzzyMatches`
- 卸载依赖 `csv-parse`、`csv-stringify`（仅 CSV 模块使用）

## 7. 实测注意事项（ncm-cli 0.1.6 行为）

- 不带参数或 `--limit 1` 会返回 HTTP 400 并伴随 libuv 断言输出 → 固定 `--limit 50` 并始终带 `--offset`
- 全量 2475 张约 50 次子进程调用，耗时约 1-2 分钟，在 15s/次超时内安全
- 已登录 + API key 已配置即可调用，无需额外授权
