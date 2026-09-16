# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-09-16-remove-obsolete-backfill-menu-items/` 变更文档（proposal/design/tasks）

## 主进程（`src/main`）

- [x] `index.ts`：删除数据菜单中「补全缺失封面」「补全缺失发行日期」「回填艺术家 ID」三个菜单项，检查分隔线不孤立
- [x] `ipc-handlers.ts`：删除 `coverFillRunning` + `album:coverFillStatus` + `album:coverFillStart` 整段
- [x] `ipc-handlers.ts`：删除 `releaseDateFillRunning` + `album:releaseDateFillStart` 整段
- [x] `ipc-handlers.ts`：删除 `artistIdFillRunning` + `album:artistIdFillStatus` + `album:artistIdFillStart` 整段
- [x] `album-service.ts`：删除 `getAlbumsWithoutCover()` / `getAlbumsWithoutReleaseDate()` / `getAlbumsWithoutArtists()`
- [x] `followed-artist-service.ts`：删除 `fillMissingIdsFromAlbums()`

## 预加载

- [x] `preload/index.ts`：删除 `albumCoverFillStatus` / `albumCoverFillStart` / `onCoverFillProgress` / `albumReleaseDateFillStart` / `onReleaseDateFillProgress` / `albumArtistIdFillStatus` / `albumArtistIdFillStart` / `onArtistIdFillProgress` / `onMenuCoverFill` / `onMenuReleaseDateFill` / `onMenuArtistIdFill`
- [x] `preload/index.d.ts`：同步删除上述 API 的类型声明

## 渲染层（`App.vue`）

- [x] 模板：删除封面 / 发行日期 / 艺术家 ID 三条 `.enrich-bar` 进度条（样式保留，其余进度条仍在用）
- [x] 脚本：删除三个进度 ref、`handleCoverFill` / `handleReleaseDateFill` / `handleArtistIdFill`、三个 `setupXxxProgressListener`
- [x] 脚本：删除 `onMounted` 中三段菜单事件监听注册与 `onUnmounted` 中对应清理及 `removeXxxListener` 变量

## 收尾

- [x] 更新 spec：`data-sync`（删两条回填 requirement + 修正存量惰性回填场景）、`album-detail-expand`（删批量补全缺失封面）、`artist-follow`（删回填后补齐关注记录 ID 场景）
- [x] README 同步（「数据维护」条目移除三个菜单项描述）
- [x] 用户手动 `npm run dev` QA（见 design.md 第 4 节）：菜单项已消失，同步 / 补全 / 导出导入 / 关注列表回归正常
- [x] QA 通过后归档 change 到 `openspec/changes/archive/`
