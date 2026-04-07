## Context

AlbumShelf 的专辑详情展开区域（album-detail-expand）目前展示封面、风格标签、外部链接等专辑级元信息。数据库中已有 `track` 表（字段：`id`、`album_id`、`netease_id`、`title`、`artist`、`track_number`、`disc_number`、`duration_ms`、`created_at`），但没有任何读取曲目数据的后端服务、IPC 接口或前端渲染逻辑。

现有架构遵循 AlbumService → IPC Handler → Preload → App.vue 的分层模式。

## Goals / Non-Goals

**Goals:**
- 新增后端曲目查询服务，按专辑 ID 返回有序曲目列表
- 新增 `track:listByAlbum` IPC 接口，前端可按需获取曲目
- 前端展开详情时请求并展示曲目列表，按碟片号→曲目号排序
- 多碟专辑按 Disc 分组展示
- 每首曲目展示：序号、标题、艺术家、时长（mm:ss）

**Non-Goals:**
- 不涉及曲目数据的写入/同步（曲目入库由未来的 sync 功能处理）
- 不支持曲目播放或试听
- 不支持曲目编辑
- 不修改 `track` 表结构

## Decisions

### 1. 新增独立的 TrackService

**决定**：创建 `src/main/track-service.ts`，包含 `getTracksByAlbumId(albumId: number)` 方法。

**理由**：与 AlbumService 职责分离，符合单一职责原则。track 表是独立实体，未来可能有更多查询需求（如按艺术家搜索曲目）。

**备选方案**：在 AlbumService 中添加方法——但会让 AlbumService 职责过重。

### 2. 前端按需懒加载曲目数据

**决定**：用户展开某专辑详情时才通过 IPC 请求该专辑的曲目列表，使用 `expandedAlbumId` 的 `watch` 触发。加载过的曲目缓存在一个 `Map<number, Track[]>` 中避免重复请求。

**理由**：避免在 `album:list` 接口中一次性加载所有专辑的曲目数据，减少初始加载时间和内存占用。缓存避免反复展开/收起时重复查询。

**备选方案**：在 album:list 中 JOIN 返回曲目——但对列表性能影响大，大部分曲目不会被查看。

### 3. 多碟分组展示

**决定**：前端按 `disc_number` 分组。若所有曲目 disc_number 均为 1（单碟），则不显示碟片标题；多碟时显示 "Disc 1"、"Disc 2" 等分组标题。

**理由**：单碟专辑是绝大多数情况，不显示 "Disc 1" 避免冗余信息。

### 4. 时长格式化

**决定**：`duration_ms` 格式化为 `m:ss` 格式（如 `3:42`、`12:05`）。`duration_ms` 为 null 时显示 `—`。

**理由**：音乐播放器通用的时长展示格式，用户已有心智模型。

### 5. IPC 接口设计

**决定**：新增 `track:listByAlbum` handler，入参为 `albumId: number`，返回 `IpcResult<Track[]>`。Track 接口包含 `id`、`title`、`artist`、`track_number`、`disc_number`、`duration_ms`。

**理由**：与现有 IPC 风格一致（`album:list`、`album:filters`），返回值使用统一的 `IpcResult` 包装。

## Risks / Trade-offs

- **[曲目数据为空]** → 当前 track 表可能没有数据（曲目同步功能尚未实现），UI 需要友好的"暂无曲目信息"空状态提示
- **[大量曲目的专辑]** → 极少数专辑可能有 50+ 曲目（如合辑），当前不做分页或虚拟滚动，直接全量渲染。后续可按需优化
- **[artist 字段可能为 null]** → track 表中 artist 允许为空，展示时使用专辑的 artist 作为 fallback 或显示 `—`