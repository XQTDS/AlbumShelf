## Why

批量校验（`album-id-verify`）依赖本地 title 与远程 name 不一致才能识别错误 ID。但实际上仍存在一类错误：本地 title 恰好与远程 name 一致，但 artist / 实际曲目内容明显不对——这种情况批量校验会判定为「匹配通过」而漏掉。当用户**自己一眼看出某张专辑信息错乱**（例如展开详情后发现曲目列表完全不对）时，需要一个直接入口手动指定正确的 `netease_album_id` 并触发完整重同步。

## What Changes

- 在专辑详情展开面板新增「修改网易云 ID」按钮（紧邻现有「重新同步」按钮）
- 弹出 `ManualFixIdModal`：展示当前专辑 title/artist 与现 `netease_album_id`，提供输入框接受新的 32 位加密 album ID
- 用户输入后必须先点击「查询」预览远程 name/artists/封面，确认无误后才能执行修复
- 复用现有 `album:fixId` IPC，完成「更新 ID + title → 删旧曲目 + 重拉曲目 → 重新获取封面 → 回写 CSV」
- 修复成功后关闭弹窗、刷新该专辑行（复用 resync 后的更新逻辑）

## Capabilities

### Modified Capabilities
- `album-id-verify`: 新增「单张专辑手动修复」入口，与现有批量校验互补

## Impact

- **后端**：复用 `album:fixId` / `album:getDetailById`，无新 IPC；`album:fixId` 调整为返回更新后的完整 `album`，便于前端原地刷新而不重载列表
- **前端**：新增 `ManualFixIdModal.vue`；`App.vue` 详情面板新增按钮 + 集成 modal
- **Preload**：`fixAlbumId` 返回类型扩展为 `{ album: Album }`
