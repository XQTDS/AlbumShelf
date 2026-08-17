# 任务清单

## 实现

- [x] `NcmCliService` 增加 `getCollectedAlbumsPage(limit, offset)` 方法及对应类型
- [x] 实现 `NcmCliSyncService`（翻页拉取 + 重试 + 映射 + 登录检查）
- [x] `SyncService` 接口瘦身：删除 `SyncFetchResult` / `FuzzyMatchAlbum`
- [x] `SyncManager`：删除 CSV 回写与 `confirmFuzzyMatches`，搜索添加仅写数据库
- [x] 删除 `csv-reader.ts` / `csv-writer.ts` / `mock-sync-service.ts` 三个文件
- [x] `ipc-handlers.ts`：切换注入点、删除 fuzzy IPC、`album:fixId` 移除 CSV 回写
- [x] `preload/index.ts`：删除 `syncConfirmFuzzyMatches` 与相关类型
- [x] `App.vue`：同步结果移除 `fuzzyMatches` 解构
- [x] 卸载 `csv-parse` / `csv-stringify` 依赖

## 收尾

- [x] 更新 `openspec/specs/data-sync/spec.md`（删除 CSV 需求，更新同步源与增量去重要求）
- [x] 更新 `openspec/specs/ncm-cli-adapter/spec.md`（新增 album collected 命令）
- [x] 更新 `openspec/specs/album-search/spec.md`（添加到收藏不再写 CSV）
- [x] 更新 `openspec/specs/album-id-verify/spec.md`（修复 ID 不再回写 CSV）
- [x] `npm run typecheck` 通过（node 侧全绿；web 侧 48 个错误为改动前已存在，与本次改动无关，经 git stash 对比验证）
- [x] 归档 change 到 `openspec/changes/archive/`
