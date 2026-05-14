## 1. 后端调整

- [x] 1.1 调整 `ipc-handlers.ts` 中 `album:fixId` 返回值，附带更新后的完整 album（含 genres）

## 2. Preload 层

- [x] 2.1 更新 `preload/index.d.ts` 中 `fixAlbumId` 的返回类型为 `IpcResult<{ album: Album }>`

## 3. 前端组件

- [x] 3.1 新建 `ManualFixIdModal.vue`：
  - props 接收当前 album（id/title/artist/netease_album_id）
  - 输入框 + 查询按钮 → 调 `albumGetDetailById`
  - 查询成功后展示远程 name/artists/封面
  - 「确认修复」调 `fixAlbumId` 并 emit 修复成功事件携带新 album
  - 错误提示与禁用态完整
- [x] 3.2 在 `App.vue` 详情面板「重新同步」按钮旁新增「🆔 修改网易云 ID」按钮，绑定打开 modal
- [x] 3.3 `App.vue` 集成 `ManualFixIdModal`，监听修复成功事件 → 复用 resync 的更新逻辑（更新 albums 数组对应项 + 清缓存 + 重拉曲目）

## 4. 验证

- [x] 4.1 `npm run build` 通过类型检查
- [x] 4.2 手动测试：选一张专辑 → 输入新加密 ID → 预览 → 确认 → 验证 title/封面/曲目刷新且 CSV 同步

