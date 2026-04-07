## Why

数据库中 track 表和 album 表的 `netease_album_id`/`netease_original_id` 字段已就绪，前端曲目列表展示也已实现，但 track 表中没有任何数据——目前缺少从网易云音乐获取曲目信息的能力。ncm-cli 已确认支持 `album tracks --albumId <加密ID>` 命令，可以获取完整的曲目列表（含曲目名、时长、艺术家、加密 ID 和原始 ID）。需要实现一个 NcmCliService 封装 ncm-cli 的调用，并在同步/展开详情时自动拉取曲目数据写入 track 表。

## What Changes

- 新增 `NcmCliService`：封装 ncm-cli 命令行调用（通过 `child_process.execFile`），解析 JSON 输出
- 新增 `TrackSyncService`：调用 `ncm-cli album tracks` 获取指定专辑的曲目列表，写入 track 表
- 修改 `TrackService`：新增 `insertTracks` / `deleteTracksByAlbumId` 方法，支持曲目写入和替换
- 修改前端曲目加载逻辑：当本地 track 表为空时，触发后端从 ncm-cli 拉取曲目并写入，然后返回结果
- 新增 IPC 接口 `track:syncByAlbum`：前端可主动触发单个专辑的曲目同步

## Capabilities

### New Capabilities

- `ncm-cli-adapter`: 封装 ncm-cli 命令行调用的通用服务，提供类型安全的调用接口
- `track-sync`: 通过 ncm-cli 获取专辑曲目列表并同步到本地 track 表

### Modified Capabilities

- `track-query`: 扩展 TrackService，新增曲目写入和删除能力
- `album-detail-expand`: 展开详情时，若本地无曲目数据则自动触发远程拉取

## Impact

- **后端新增文件**：`ncm-cli-service.ts`（ncm-cli 调用封装）、`track-sync-service.ts`（曲目同步逻辑）
- **后端修改文件**：`track-service.ts`（新增写入方法）、`ipc-handlers.ts`（新增 `track:syncByAlbum`）
- **前端修改**：`App.vue` 曲目加载逻辑（空数据时触发同步）
- **Preload**：`index.d.ts` 和 `index.ts` 新增 `trackSyncByAlbum` API
- **依赖**：无新依赖（使用 Node.js 内置 `child_process`）