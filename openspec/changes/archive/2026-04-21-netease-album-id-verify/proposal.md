## Why

数据库中部分专辑的 `netease_album_id` 是错误的——通过该 ID 调用 ncm-cli 获取的专辑详情（name/artists）与本地存储的 title/artist 不一致。这导致曲目同步、封面获取等依赖该 ID 的功能返回错误数据。需要一个批量校验机制来检测这些不匹配，并在用户手动确认后修复为正确的 ID。

## What Changes

- 新增"校验专辑 ID"按钮到工具栏，一键触发批量校验
- 后端批量调用 `getAlbumDetail()` 对比本地 title/artist 与远程返回数据（忽略大小写 + trim 后精确匹配）
- 校验完成后展示所有不匹配的专辑列表，自动搜索候选结果
- 用户逐个确认修复：选择正确的搜索结果或跳过
- 确认后更新 `netease_album_id`、`netease_original_id`，重新同步曲目/封面，回写 CSV

## Capabilities

### New Capabilities
- `album-id-verify`: 批量校验 netease_album_id 正确性并提供修复流程的完整能力，包含校验逻辑、搜索候选、用户确认交互、数据修复

### Modified Capabilities
- `data-sync`: 新增更新已有专辑 netease_album_id 的能力，以及修复后回写 CSV 的逻辑
- `local-storage`: AlbumService 需支持更新 netease_album_id 字段

## Impact

- **后端**: `album-service.ts`（新增 updateNeteaseAlbumId 方法）、`ipc-handlers.ts`（新增 album:verifyIds / album:fixId IPC）、`csv-writer.ts`（新增 updateNeteaseIdInCsv）
- **前端**: 新增 `IdVerifyModal.vue` 组件、`App.vue` 工具栏新增按钮
- **Preload**: 暴露新 IPC 接口类型
- **API 调用**: 校验过程批量调用 ncm-cli，需注意限流（加 delay）
