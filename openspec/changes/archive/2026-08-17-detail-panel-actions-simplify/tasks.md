# 任务清单

## 实现

- [x] `App.vue` 模板：`.detail-links` 删除「重新同步」「修改网易云 ID」按钮；删除 `<ManualFixIdModal>` 挂载
- [x] `App.vue` 脚本：删除 ManualFixIdModal import、`manualFixModalVisible`/`manualFixTargetAlbum`、`handleResync`/`resyncingAlbumId`、`openManualFixId`/`handleManualFixDone`、Esc 守卫条目
- [x] `App.vue` 样式：删除 `.btn-resync` 整组规则
- [x] 删除 `src/renderer/src/ManualFixIdModal.vue`
- [x] 更新 `openspec/specs/album-id-verify/spec.md`（删除面板入口与 ManualFixIdModal 专属 requirement）

## 收尾

- [ ] 用户手动 `npm run dev` QA（面板外链区仅剩两个外链；工具栏「校验专辑 ID」与 IdVerifyModal 流程正常；Esc 行为正常）
- [x] 归档 change 到 `openspec/changes/archive/`
