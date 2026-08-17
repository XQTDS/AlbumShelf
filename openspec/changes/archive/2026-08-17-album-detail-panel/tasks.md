# 任务清单

## 实现

- [x] `App.vue` 模板：aside 由弹出式抽屉改为常驻 `.detail-panel`（头部提出为 `.panel-header`，内容包入 `.panel-body`，新增 `v-else` 占位态）
- [x] `App.vue` 样式：`.detail-drawer`/`.drawer-*` 整组改为 `.detail-panel`/`.panel-*`；删除宽度过渡动画；`:root` `--drawer-width` → `--panel-width`；新增 `.panel-empty` 占位样式
- [x] `App.vue` 脚本：零改动（复用 `selectedAlbumId`/`selectedAlbum`/`toggleSelect`/`closeDetail`/Esc 监听/watch 编辑态重置）
- [x] 更新 `openspec/specs/album-detail-expand/spec.md`（抽屉 → 常驻面板）
- [x] 重建 change 文档为 `2026-08-17-album-detail-panel`（替代 `2026-08-17-album-detail-drawer`）

## 收尾

- [x] `npm run typecheck:node` 通过；`typecheck:web` 仅剩既有基线错误（`window.api` 类型声明问题），本次改动未引入新错误
- [ ] `npm run dev` 手动 QA（占位态/选中切换零位移/✕/Esc/筛选过滤/窄窗口）
- [x] 归档 change 到 `openspec/changes/archive/`
