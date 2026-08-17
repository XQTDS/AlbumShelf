# 设计：移除遗留的「专辑 ID 校验与修复」功能

## 删除清单（自上而下完整链路）

### 1. 菜单入口

- `album-shelf/src/main/index.ts`：删除「工具」菜单中的「校验专辑 ID」菜单项（发送 `menu:verifyIds` 事件）。

### 2. Renderer 弹窗

- 删除 `album-shelf/src/renderer/src/IdVerifyModal.vue` 整个文件。
- `album-shelf/src/renderer/src/App.vue`：
  - 删除 `<IdVerifyModal>` 挂载、import、`idVerifyModalRef` ref
  - 删除 `menu:verifyIds` 菜单事件监听（`onMenuVerifyIds`）及 onUnmounted 中的清理

### 3. Preload API

- `album-shelf/src/preload/index.ts` 删除：`onMenuVerifyIds`、`albumGetDetailById`、`verifyAlbumIds`、`fixAlbumId`、`onVerifyProgress`
- `album-shelf/src/preload/index.d.ts` 删除对应类型声明：`VerifyIdsMismatch`、`VerifyIdsError`、`VerifyIdsResult`、`NcmAlbumDetail`（仅被 `albumGetDetailById` 使用）、`AlbumShelfAPI` 上的 5 个成员

### 4. IPC Handler

- `album-shelf/src/main/ipc-handlers.ts` 删除「专辑 ID 校验与修复」整节：
  - `album:getDetailById`
  - `album:verifyIds`
  - `album:fixId`

### 5. 由此产生的死代码

- `album-shelf/src/main/album-service.ts`：删除 `updateNeteaseAlbumId`（仅 `album:fixId` 调用）

### 6. 文档

- 根目录 `README.md`：「数据维护」行移除「CSV 导入」提法

## 保留清单

| 项 | 原因 |
|----|------|
| `albumSearchOnline` / `albumAddToCollection` / `albumGetCollectedNeteaseIds` | 在线搜索弹窗仍在使用 |
| `albumService.getAllAlbumsForEnrich()` | 补全功能（enrich-service）仍在用 |
| `ncmCliService.getAlbumTracks` / `searchAlbum` / `getAlbumDetail` | 曲目同步 / 在线搜索 / 封面获取与模糊匹配流程仍在用 |
| `trackService.deleteTracksByAlbumId` / `trackSyncService.syncTracksByAlbum` | 同步流程仍在使用 |
| 数据库 `netease_album_id` / `netease_original_id` 字段 | 同步流程写入、去重依赖 |
| `openspec/specs/album-id-verify/spec.md` | 随本次变更删除（历史见 archive） |

## 风险与验证

- 删除后需确认无遗漏引用：全局搜索 `verifyIds|IdVerify|fixId|getDetailById|updateNeteaseAlbumId|VerifyIds` 应仅剩 archive 历史文档。
- 菜单栏「工具」菜单在删除后只剩「风格统计」一项，菜单结构保持不变（不整体移除菜单）。
- 验证点：`npm run dev` 后确认菜单无「校验专辑 ID」项、工具栏/弹窗正常、同步与在线搜索不受影响。
