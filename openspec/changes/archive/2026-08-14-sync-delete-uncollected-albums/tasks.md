# 任务清单

## 实现

- [x] `AlbumService` 新增 `deleteAlbumsByNeteaseAlbumIds(ids)` 方法（事务 + 级联）
- [x] `SyncManager.sync()` 计算缺失集合并执行删除，`SyncResult` 增加 `deleted`
- [x] `preload/index.d.ts` SyncResult 增加 `deleted` 字段
- [x] `App.vue` 同步完成提示包含删除数量

## 收尾

- [x] 更新 `openspec/specs/data-sync/spec.md`（新增"清理已取消收藏专辑"需求）
- [x] `npm run typecheck:node` 通过
- [x] 归档 change 到 `openspec/changes/archive/`
