## 1. 后端 - 数据层

- [x] 1.1 在 album-service.ts 中新增 `getAlbumsWithoutCover()`：查询 `cover_url` 为空且 `netease_album_id` 非空的专辑

## 2. 后端 - IPC 与菜单

- [x] 2.1 在 ipc-handlers.ts 中新增 `album:coverFillStatus` 处理器（返回 pending 数量与 running 状态）
- [x] 2.2 在 ipc-handlers.ts 中新增 `album:coverFillStart` 批量处理器：登录前置检查 → 顺序循环 + 300ms 节流 → http→https 转换并 `updateAlbum` 持久化 → 进度事件推送 → 登录失效中止 → 返回 `{ total, filled, failed }`
- [x] 2.3 在 index.ts 数据菜单新增「补全缺失封面」菜单项，发送 `menu:coverFill` 事件

## 3. preload

- [x] 3.1 preload/index.ts 新增 `albumCoverFillStatus` / `albumCoverFillStart` / `onCoverFillProgress` / `onMenuCoverFill`
- [x] 3.2 preload/index.d.ts 新增 `CoverFillProgress`、`CoverFillResult` 类型与 API 方法声明

## 4. 前端

- [x] 4.1 App.vue 新增封面补全进度条（复用 enrich-bar 样式）
- [x] 4.2 App.vue 新增 `handleCoverFill`、进度监听与菜单监听（含 onUnmounted 清理）
- [x] 4.3 完成后刷新专辑列表并重载选中专辑封面，toast 展示成功/失败统计

## 5. OpenSpec 收尾

- [x] 5.1 将 spec delta 合并进 openspec/specs/album-detail-expand/spec.md
- [x] 5.2 将 change 归档到 openspec/changes/archive/
