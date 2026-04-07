## Why

当前专辑详情展开区域展示了封面、风格标签、外部链接等专辑级别的元信息，但缺少最核心的内容——曲目列表。用户无法在列表视图中快速查看一张专辑包含哪些歌曲、每首歌的时长和演唱者。数据库已有 `track` 表，但尚未有任何读取和展示曲目的通路。补充这一能力可以显著提升详情区域的信息密度和实用价值。

## What Changes

- 后端新增按专辑 ID 查询曲目列表的 IPC 接口（`track:listByAlbum`）
- 前端展开详情区域后，按 `disc_number` → `track_number` 顺序展示该专辑的所有曲目
- 每首曲目显示：曲目序号、标题、艺术家（Artists）、时长（`duration_ms` 格式化为 mm:ss）
- 多碟专辑按碟片分组显示（如 "Disc 1"、"Disc 2"）
- 曲目列表为空时显示"暂无曲目信息"占位提示

## Capabilities

### New Capabilities

- `track-query`: 后端提供按专辑 ID 查询曲目列表的服务能力和 IPC 接口

### Modified Capabilities

- `album-detail-expand`: 展开的详情区域新增曲目列表展示，包含每首曲目的序号、标题、艺术家和时长

## Impact

- **后端**：新增 `TrackService`（或在 `AlbumService` 中扩展）和 `track:listByAlbum` IPC handler
- **前端**：修改 `App.vue` 详情展开区域，新增曲目列表渲染逻辑
- **Preload**：`index.d.ts` 新增 Track 类型定义和 API 声明
- **依赖**：无新依赖