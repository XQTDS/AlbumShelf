## 1. NcmCliService - ncm-cli 命令行封装

- [x] 1.1 创建 `src/main/ncm-cli-service.ts`，实现 `NcmCliService` 类，封装 `child_process.execFile` 调用 ncm-cli
- [x] 1.2 实现 `execute<T>(args: string[]): Promise<T>` 泛型方法：固定 `--output json`，解析 JSON，检查 `code === 200`，15 秒超时
- [x] 1.3 实现 `getAlbumTracks(albumId: string)` 便捷方法：调用 `album tracks --albumId <id>`，返回类型化的曲目数组

## 2. TrackService - 新增写入和删除方法

- [x] 2.1 在 `track-service.ts` 中新增 `TrackInsert` 接口（`album_id`、`netease_song_id`、`netease_original_id`、`title`、`artist`、`track_number`、`disc_number`、`duration_ms`）
- [x] 2.2 实现 `deleteTracksByAlbumId(albumId: number)` 方法
- [x] 2.3 实现 `insertTracks(tracks: TrackInsert[])` 方法，使用事务批量插入

## 3. TrackSyncService - 曲目同步逻辑

- [x] 3.1 创建 `src/main/track-sync-service.ts`，注入 `NcmCliService`、`TrackService`、`AlbumService`
- [x] 3.2 实现 `syncTracksByAlbum(albumId: number, neteaseAlbumId: string): Promise<Track[]>` 方法：调用 ncm-cli → 映射数据 → 删旧插新 → 更新 album.track_count → 返回曲目列表

## 4. IPC 集成

- [x] 4.1 在 `ipc-handlers.ts` 中初始化 `NcmCliService` 和 `TrackSyncService`
- [x] 4.2 修改 `track:listByAlbum` handler：查询为空时自动调用 `TrackSyncService` 拉取，失败则返回空数组
- [x] 4.3 新增 `track:syncByAlbum` handler：接收 `albumId`，主动触发曲目同步并返回结果

## 5. Preload 桥接

- [x] 5.1 在 `preload/index.d.ts` 中新增 `trackSyncByAlbum` 方法声明
- [x] 5.2 在 `preload/index.ts` 中新增 `trackSyncByAlbum` IPC invoke 桥接