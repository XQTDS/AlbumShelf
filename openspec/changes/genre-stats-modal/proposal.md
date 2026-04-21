## Why

用户收藏了大量专辑，每张专辑都可能关联多个风格标签，但目前没有一个全局视角来了解自己的收藏偏好。新增"风格统计"功能，以独立弹窗形式展示各风格的专辑数量（Top 15 + 其他），帮助用户直观认知自己的音乐口味分布。

## What Changes

- 新增 `AlbumService.getGenreStats()` 方法，查询所有风格及其关联专辑数量
- 新增 `genre:stats` IPC handler，为渲染进程提供风格统计数据
- 新增 preload API `genreStats()`
- 新增 `GenreStatsModal.vue` 弹窗组件，使用纯 CSS 水平条形图展示 Top 15 风格 + "其他"汇总
- 在 `App.vue` 工具栏添加「📊 风格统计」触发按钮

## Capabilities

### New Capabilities
- `genre-stats`: 风格统计弹窗功能，涵盖后端统计查询、IPC 通信和前端条形图弹窗展示

### Modified Capabilities
<!-- 无需修改现有 spec 的行为要求 -->

## Impact

- **后端**：`album-service.ts` 新增查询方法；`ipc-handlers.ts` 新增 handler
- **Preload**：`preload/index.ts` 和 `preload/index.d.ts` 新增 API 声明
- **前端**：新建 `GenreStatsModal.vue`；`App.vue` 新增按钮和弹窗引用
- **依赖**：无新增外部依赖，条形图使用纯 CSS 实现