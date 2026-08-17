## Why

详情面板目前展示封面、风格、评分、曲目列表等信息，但缺少社区讨论维度。ncm-cli 0.1.6 已支持 `comment list-hot --type album` 命令，可获取专辑热门评论；数据库中的 `netease_album_id`（32 位 hex）可直接作为 `--resourceId` 使用，2477 张收藏专辑全部具备该字段。用户希望在专辑详情页看到网易云热评。

## What Changes

- **后端**：`NcmCliService` 新增 `getAlbumHotComments(albumId, limit, offset)`，封装 `ncm-cli comment list-hot` 命令
- **IPC**：新增 `album:comments` 通道，返回该专辑的热评列表与总数（不做持久化）
- **前端**：详情面板曲目列表下方新增「网易云热评」区块，展示头像、昵称、内容、点赞数与时间
- **缓存策略**：渲染进程内存缓存 + 5 分钟 TTL + 手动刷新按钮（热评会变化，不做持久化缓存）

## Capabilities

### Modified Capabilities

- album-detail-expand: 详情面板新增网易云热评展示需求
- ncm-cli-adapter: 新增 `comment list-hot` 命令封装需求

## Impact

- 后端 IPC：新增 `album:comments` 通道（ipc-handlers.ts）
- ncm-cli 服务：新增 `getAlbumHotComments` 方法与 `NcmCliComment` 类型（ncm-cli-service.ts）
- preload：新增 `albumComments` API 与 `NcmComment` 类型（index.ts / index.d.ts）
- 前端：App.vue 新增评论区块、TTL 内存缓存与刷新交互
- 无数据库表变更、无菜单变更、无新依赖
