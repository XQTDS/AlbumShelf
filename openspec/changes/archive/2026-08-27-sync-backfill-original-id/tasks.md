# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-08-27-sync-backfill-original-id/` 变更文档（proposal/design/tasks）

## 主进程（`src/main`）

- [x] `album-service.ts`：`AlbumUpdate` 增加 `netease_original_id?: number | null`；新增 `backfillOriginalIds(rows)` 批量补全方法（事务 + prepared UPDATE + `IS NULL` 守卫）
- [x] `sync-manager.ts`：`SyncResult` 增加 `backfilled`；existing 分支收集补全批次（本地空 + 本次有值）；循环后调用 `backfillOriginalIds` 并统计

## 预加载与渲染层

- [x] `preload/index.d.ts`：`SyncResult` 增加 `backfilled`
- [x] `App.vue` `handleSync`：完成提示条件与文案追加补全张数（`backfilled > 0` 时）

## 收尾

- [x] 更新 `openspec/specs/data-sync/spec.md`（见 design.md 第 4 节）
- [x] README 同步（「网易云同步」条目补充顺带补全跳转 ID 的说明）
- [x] 用户手动 `npm run dev` QA：
  - 同步一次后，详情面板此前无跳转链接的专辑（如 Black Messiah）出现「🎵 网易云音乐」，点击可在浏览器打开正确页面
  - 完成提示出现「补全 X 张网易云跳转 ID」；再次同步补全数趋近 0
  - 已有跳转链接的专辑不受影响；库中非空行数量只增不减
- [x] QA 通过后归档 change 到 `openspec/changes/archive/`
