# 设计

## 现状

- `handleRandomPick`（App.vue）：`album:random` 取随机专辑 → 设 `searchQuery = 专辑标题` → 清其余过滤 → 重置分页 → `fetchAlbums(false)` 单页加载 → `scrollToAlbumRow` → 选中
- `handlePlayerCoverClick`（App.vue）：专辑在当前列表 → 直接选中；否则清过滤 → `fetchAlbumsAndScrollTo`（一次全量）→ 选中

## 改动

`handleRandomPick` 定位段改为与 `handlePlayerCoverClick` 同一套机制：

1. 专辑已在 `albums` 中：直接 `scrollToAlbumRow` 定位并选中（保留用户过滤/搜索状态，无额外 IPC）
2. 不在已加载列表：清空搜索/艺术家/风格/排序条件，重置分页，`fetchAlbumsAndScrollTo(randomAlbum.id)` 一次全量加载并内部滚动定位，随后选中

## 风险与验证点

- 清条件均为直接改 ref，不触发 watcher（搜索防抖仅由输入事件驱动），不会产生竞态请求
- 随机专辑必在全库中，清空过滤后 `fetchAlbumsAndScrollTo` 必能命中目标（全量结果集包含该专辑）
- 验证点：随机选择后搜索框保持为空、列表恢复全量并定位到随机专辑、详情面板展开；当前列表已含随机专辑时直接定位且筛选状态保留
