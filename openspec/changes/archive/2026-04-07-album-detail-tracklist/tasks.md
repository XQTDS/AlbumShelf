## 1. 后端 TrackService

- [x] 1.1 创建 `src/main/track-service.ts`，定义 `Track` 接口和 `TrackService` 类
- [x] 1.2 实现 `getTracksByAlbumId(albumId: number): Track[]` 方法，按 `disc_number` 升序、`track_number` 升序查询 track 表

## 2. IPC 接口

- [x] 2.1 在 `src/main/ipc-handlers.ts` 中注册 `track:listByAlbum` handler，调用 TrackService 返回 `IpcResult<Track[]>`

## 3. Preload 类型声明

- [x] 3.1 在 `src/preload/index.d.ts` 中新增 `Track` 接口定义
- [x] 3.2 在 `AlbumShelfAPI` 接口中新增 `trackListByAlbum` 方法声明

## 4. Preload 桥接

- [x] 4.1 在 `src/preload/index.ts` 中新增 `trackListByAlbum` API 的 IPC invoke 桥接

## 5. 前端曲目列表展示

- [x] 5.1 在 `App.vue` 中新增 `trackCache`（`Map<number, Track[]>`）响应式状态和曲目加载逻辑
- [x] 5.2 在 `expandedAlbumId` 的 watch 中触发曲目数据加载，已缓存则跳过
- [x] 5.3 新增 `formatDuration(ms: number | null): string` 工具函数，将毫秒转为 `m:ss` 格式
- [x] 5.4 在详情展开区域新增曲目列表渲染：按碟片分组、显示序号/标题/艺术家/时长
- [x] 5.5 处理边界情况：曲目为空显示"暂无曲目信息"、单碟不显示 Disc 标题、artist 为空显示"—"