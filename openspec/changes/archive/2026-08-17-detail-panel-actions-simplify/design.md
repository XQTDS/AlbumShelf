# 设计：移除面板操作按钮与前端死代码

## 1. 模板（App.vue）

- `.detail-links` 内删除「重新同步」「修改网易云 ID」两个 `<button class="btn btn-resync">`，仅保留两个外链 `<a>`
- 删除 `<ManualFixIdModal ...>` 弹窗挂载（模板底部）

## 2. 脚本（App.vue）

删除以下全部（无其他引用）：

- `import ManualFixIdModal from './ManualFixIdModal.vue'`
- `manualFixModalVisible` / `manualFixTargetAlbum` 状态（含类型定义块）
- `handleResync` + `resyncingAlbumId`
- `openManualFixId` / `handleManualFixDone`
- Esc 守卫（`handleDetailKeydown`）中的 `manualFixModalVisible.value ||` 条目

## 3. 样式（App.vue）

删除 `.btn-resync` 整组规则（仅上述两按钮使用：`.btn-resync`、`:hover`、`:disabled`、`.spinner.small`）。

## 4. 组件文件

删除 `src/renderer/src/ManualFixIdModal.vue`（唯一入口即面板按钮，移除后不可达）。

## 5. 保留项

- 后端 `album:resync` / `album:fixId` / `album:getDetailById` IPC 与 preload API 全部保留（`album:resync` 备用；后两者 IdVerifyModal 仍在用）
- 工具栏「校验专辑 ID」与 IdVerifyModal 批量校验流程不受影响

## 6. Spec 更新（album-id-verify）

- 删除「单张专辑手动指定网易云 ID 入口」requirement（面板入口不复存在）
- 删除 ManualFixIdModal 专属 requirement：「新 ID 输入与远程预览」「复用现有修复链路」
- 保留「修复后重新同步」「修复成功后返回完整 album」（描述 `album:fixId` 后端行为，IdVerifyModal 流程仍成立）
