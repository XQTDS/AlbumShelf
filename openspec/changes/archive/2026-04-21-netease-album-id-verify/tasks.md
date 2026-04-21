## 1. 后端数据层

- [x] 1.1 在 `album-service.ts` 新增 `updateNeteaseAlbumId(id, newNeteaseAlbumId, newOriginalId)` 方法，含 UNIQUE 冲突检查
- [x] 1.2 在 `csv-writer.ts` 新增 `updateNeteaseIdInCsv(title, artist, newNeteaseId)` 方法，通过 title + artist 定位行更新 netease_id

## 2. 后端校验逻辑

- [x] 2.1 在 `ipc-handlers.ts` 新增 `album:verifyIds` IPC handler，实现批量校验逻辑：遍历所有专辑、调用 getAlbumDetail、比较 title、300ms 间隔、通过 event 推送进度
- [x] 2.2 在 `ipc-handlers.ts` 新增 `album:fixId` IPC handler，实现单条修复逻辑：更新 netease_album_id、清除旧曲目并重新同步、重新获取封面、回写 CSV

## 3. Preload 层

- [x] 3.1 在 `preload/index.ts` 暴露 `verifyAlbumIds()` 方法（调用 album:verifyIds）
- [x] 3.2 在 `preload/index.ts` 暴露 `fixAlbumId(albumId, newNeteaseAlbumId, newOriginalId)` 方法（调用 album:fixId）
- [x] 3.3 在 `preload/index.ts` 注册 `onVerifyProgress` 事件监听（接收 album:verifyProgress event）
- [x] 3.4 更新 `preload/index.d.ts` 类型声明

## 4. 前端组件

- [x] 4.1 创建 `IdVerifyModal.vue` 组件：展示不匹配列表、逐个确认交互、搜索候选展示、进度条展示
- [x] 4.2 在 `App.vue` 工具栏添加"校验专辑 ID"按钮，绑定触发校验逻辑和打开 IdVerifyModal

## 5. 集成测试

- [x] 5.1 手动测试：触发校验 → 确认进度显示 → 查看 mismatch 列表 → 选择候选修复 → 验证数据更新
