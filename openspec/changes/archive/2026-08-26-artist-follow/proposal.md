# 关注艺术家功能（artist-follow）

## Why

AlbumShelf 目前把艺术家当作纯文本处理：`album.artist` 是 `/` 拼接的名字串，同步链路在落库时丢弃了网易云艺术家 ID，UI 中艺术家名不可点击，也不存在「关注」概念。

用户希望**关注某些艺术家**，并在后续基于关注信息做更多事情（查看关注艺术家的新专辑、演出计划等）。本次 change 实现关注能力 v1：关注/取关、关注状态展示、关注列表管理、按已关注艺术家筛选专辑；同时在同步链路中保留艺术家 ID，为后续按 artistId 查询网易云数据铺路，避免未来重新同步。

## What Changes

- **数据模型**：
  - 新表 `followed_artist`（关注粒度 = 拆分后的单个艺术家名，`name` UNIQUE），同时保存网易云明文 `original_id` 与加密 `encrypted_id`（ncm-cli 0.1.6 `artist songs` 命令实测要求加密 ID）
  - `album` 表新增 `artist_ids` 列（JSON 数组 `[{originalId, id}]`，下标与 `artist` 文本按同一拆分函数拆出的名字顺序对齐；NULL = 未知）
  - 导出格式版本升为 2（含 `followedArtists`），导入兼容 v1
- **同步链路**：`toNeteaseAlbum` 映射时不再丢弃艺术家 ID；新列仅对新插入专辑生效（保持「已存在不改动」不变量），存量数据由「回填艺术家 ID」批量任务惰性回填（复用封面/发行日期回填模式）
- **服务层**：新增 `FollowedArtistService`（关注/取关/列表/专辑数统计）；`queryAlbums` 支持 `followedOnly`（只看已关注艺术家）与 `artistPartial`（按单个艺术家名部分匹配，多艺术家专辑 "A/B" 可被 A 命中）
- **IPC/preload**：`artist:follow` / `artist:unfollow` / `artist:listFollowed`、`album:artistIdFillStatus` / `album:artistIdFillStart`（含进度事件）、`album:addToCollection` 载荷扩展
- **UI**：
  - 详情面板艺术家名改为可点击芯片，芯片带关注星标（★ 已关注 / ☆ 未关注）；表格/唱片墙保持纯文本，已关注艺术家名以金色文字标识；唱片墙卡片增加常驻 ★ 角标标识含已关注艺术家的专辑
  - 点击详情面板芯片弹出 `ArtistActionPopover` 小菜单：「关注/取消关注」+「筛选该艺术家专辑」
  - 工具栏新增「★ 已关注 (n)」筛选开关；菜单「工具 → 关注列表」打开独立的关注列表窗口（FollowedArtistsWindow，单实例、无菜单栏、行点击筛选主窗口并关闭、跨窗口关注状态广播同步）
  - 回填艺术家 ID 显示实时进度条，回填完成后自动为缺失 ID 的关注记录按名字匹配补齐
- **ncm-cli 适配层**：预留艺术家命令封装区，记录本次探测结论

## Capabilities

### New Capabilities

- `artist-follow`：关注/取消关注艺术家、关注状态展示、关注列表管理、按已关注艺术家筛选专辑

### Modified Capabilities

- `data-sync`：同步映射保留艺术家 ID（`NeteaseAlbum` 增加 `artist_ids`）
- `album-list-ui`：艺术家展示由纯文本改为可点击芯片；新增「已关注」筛选开关
- `local-storage`：`followed_artist` 新表、`album.artist_ids` 新列、导出格式 v2
- `ncm-cli-adapter`：艺术家命令族探测结论与预留封装位置

## Non-goals

- 不做「关注艺术家的新专辑」提醒/列表（后续 change，依赖本次落库的 artistId）
- 不做演出计划查询（网易云 API 无此数据源，需外部数据源，另行评估）
- 不支持搜索并关注收藏之外的任意艺术家（`search all` 综合搜索实测可返回艺术家记录，但 v1 不引入新的在线搜索入口）
- 不升级 ncm-cli 到 0.1.7（升级提示已出现，但版本升级风险独立评估）
- 不做重名艺术家消歧（v1 接受按名字关注；`followed_artist` 已预留 ID 字段，未来可升级）

## Impact

- **主进程**：[database.ts](../../../album-shelf/src/main/database.ts) 建表/迁移列/导出导入 v2；[followed-artist-service.ts](../../../album-shelf/src/main/followed-artist-service.ts) 新增；[album-service.ts](../../../album-shelf/src/main/album-service.ts) 类型与查询扩展；[sync/sync-service.ts](../../../album-shelf/src/main/sync/sync-service.ts)、[sync/ncm-cli-sync-service.ts](../../../album-shelf/src/main/sync/ncm-cli-sync-service.ts)、[sync/sync-manager.ts](../../../album-shelf/src/main/sync/sync-manager.ts) 字段透传；[ipc-handlers.ts](../../../album-shelf/src/main/ipc-handlers.ts) 新增 handler、回填任务与关注变更广播；[window-ref.ts](../../../album-shelf/src/main/window-ref.ts) 主窗口显式引用（多窗口事件转发）；[ncm-cli-service.ts](../../../album-shelf/src/main/ncm-cli-service.ts) 预留注释区
- **preload**：[index.ts](../../../album-shelf/src/preload/index.ts)、[index.d.ts](../../../album-shelf/src/preload/index.d.ts) 新 API 与类型
- **渲染层**：[App.vue](../../../album-shelf/src/renderer/src/App.vue) 芯片化/工具栏/筛选接线/乐观更新；[ArtistActionPopover.vue](../../../album-shelf/src/renderer/src/ArtistActionPopover.vue)、[FollowedArtistsWindow.vue](../../../album-shelf/src/renderer/src/FollowedArtistsWindow.vue)、[followed.html](../../../album-shelf/src/renderer/followed.html)/[followed-main.ts](../../../album-shelf/src/renderer/src/followed-main.ts)（关注列表独立窗口多页面入口）新增；[AlbumSearchModal.vue](../../../album-shelf/src/renderer/src/AlbumSearchModal.vue) 载荷扩展
- **文档**：[README.md](../../../README.md) 功能特性与项目结构
- **已知取舍**：含 `/` 的艺术家名（如 "AC/DC"）会被拆分函数拆成两个名字——与既有艺术家筛选粒度一致，接受；重名艺术家不可消歧，v1 接受
