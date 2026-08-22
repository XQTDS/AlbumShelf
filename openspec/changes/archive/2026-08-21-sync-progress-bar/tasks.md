# 2026-08-21-sync-progress-bar 任务清单

## 主进程

- [x] `sync-service.ts`：`fetchCollectedAlbums` 加可选 `onProgress?: (fetched: number) => void` 参数
- [x] `ncm-cli-sync-service.ts`：实现每页拉取后调用 `onProgress`
- [x] `sync-manager.ts`：导出 `SyncProgress` 接口；`sync()` 加可选 `onProgress` 回调，fetching 阶段转发、writing 阶段按 50 张粒度节流推送（含起始 0 与结束 N 两次事件）
- [x] `ipc-handlers.ts`：`sync:start` 接 `event.sender` 推送 `sync:progress`

## preload

- [x] `preload/index.ts`：新增 `onSyncProgress` 监听方法
- [x] `preload/index.d.ts`：新增 `SyncProgress` 接口与 `AlbumShelfAPI.onSyncProgress` 类型声明

## 渲染层

- [x] `App.vue` 模板：新增同步进度条（复用 enrich-bar 样式；fetching 显示「已获取 X 张」+ 不定长动画，writing 显示「X/Y 张」+ 比例填充）
- [x] `App.vue` 脚本：`syncProgress` ref、`setupSyncProgressListener()` 并在 `onMounted` 注册；`handleSync` finally 清除进度条；`onUnmounted` 注销监听
- [x] `App.vue` 样式：新增 `.sync-progress-indeterminate` 不定长动画

## 收尾

- [x] 更新 `openspec/specs/data-sync/spec.md`（新增「同步进度反馈」Requirement）
- [x] 同步 README 功能特性说明
- [x] 归档本 change 到 `openspec/changes/archive/`
