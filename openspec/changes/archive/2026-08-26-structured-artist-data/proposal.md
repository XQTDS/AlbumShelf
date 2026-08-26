# 艺术家结构化存储（structured-artist-data）

## Why

`album.artist` 是 `/` 拼接的艺术家名字串。按 `/` 拆分名字在艺术家名本身含 `/`（如 AC/DC）时会误拆——艺术家边界在同步落库时已丢失，无法从字符串无损恢复。ncm-cli 返回的 `artists` 数组本身是结构化的（name + originalId + encryptedId），拼成字符串是同步层的降级转换；上一个 change 新增的 `artist_ids` 列只存了 ID、没有名字，且依赖「下标与按 / 拆分名字对齐」的脆弱假设。

本次 change 新增 `album.artists` JSON 列（`[{name, originalId, id}]`）作为艺术家数据的结构化真源：新同步/在线添加直接落结构化数据；存量专辑通过升级版回填任务在线重取并重写；所有筛选/展示/关注逻辑结构化优先、缺失时回退现有文本拆分。

## What Changes

- **数据模型**：新列 `album.artists TEXT`（JSON `[{name, originalId, id}]`，NULL = 未回填）；删除未随版本发布的 `artist_ids` 列（best-effort DROP COLUMN）；`artist` 文本列保留为派生展示字段（搜索 LIKE、MusicBrainz 补全、别名、导出继续消费），写入点统一 `' / '` 分隔符
- **解析层**：新建 `album-artist.ts` 作为主进程唯一解析真源——`splitArtistText` 迁入、`parseAlbumArtistsJson`、`albumArtistRefs`（结构化优先 + legacy 文本拆分回退，回退路径 ID 一律 null、读时不写库）
- **同步链路**：`NeteaseAlbum.artist_ids` → `artists`（含 name），三处写入点（全量同步 / 单专辑添加 / 在线添加）同时派生文本与 JSON
- **读方**：筛选预计算块、筛选建议、关注专辑数统计、关注 ID 补齐全部改读结构化（按 name 匹配，废弃下标对齐）
- **回填任务**：写 `artists`（含 name）并顺带重写 `artist` 文本为 `' / '` 规范化（修复 AC/DC 类被拆坏的存量文本）；guard 改 `artists IS NULL OR ''`
- **导出/导入**：v2 就地重定义（未发布无兼容包袱）——artists 替代 artist_ids；旧开发版 v2 文件的 artist_ids 键自然忽略

## Capabilities

### Modified Capabilities

- `local-storage`：album.artists 新列与迁移、artist_ids 列移除、导出 v2 重定义
- `data-sync`：同步与在线添加写入结构化艺术家数据；回填任务重取并重写文本
- `artist-follow`：关注 ID 补齐改为按 name 匹配结构化数据
- `album-list-ui`：筛选/建议/芯片展示的结构化优先 + 回退语义
- `ncm-cli-adapter`：`album collected` / `album get` 的 artists 数组为结构化真源

## Non-goals

- 不做 album_artist 正规化表（千级库全表扫描微秒级；JSON 列与现有模式同构、迁移最简，注释保留演进路径）
- 不改 MusicBrainz 补全与别名学习的整串文本语义（enrich/artist-alias 继续消费 artist 文本列）
- 不改轨道级 track.artist（另一张表，`' / '` 拼接无 ID，不影响专辑级改造）
- 不做 artist_ids → artists 的预迁移（旧下标对齐逻辑正是要废弃的，直接 DROP + 回填重取）

## Impact

- **主进程**：[database.ts](../../../album-shelf/src/main/database.ts) 迁移/导出导入；[album-artist.ts](../../../album-shelf/src/main/album-artist.ts) 新增；[album-service.ts](../../../album-shelf/src/main/album-service.ts) 类型/查询/筛选；[followed-artist-service.ts](../../../album-shelf/src/main/followed-artist-service.ts) 统计与 ID 补齐；[sync/sync-service.ts](../../../album-shelf/src/main/sync/sync-service.ts)、[sync/ncm-cli-sync-service.ts](../../../album-shelf/src/main/sync/ncm-cli-sync-service.ts)、[sync/sync-manager.ts](../../../album-shelf/src/main/sync/sync-manager.ts) 同步链；[ipc-handlers.ts](../../../album-shelf/src/main/ipc-handlers.ts) 添加载荷与回填任务
- **preload**：[index.d.ts](../../../album-shelf/src/preload/index.d.ts) Album/AddAlbumRequest 类型
- **渲染层**：[App.vue](../../../album-shelf/src/renderer/src/App.vue) helper 重写与 v-memo；[AlbumSearchModal.vue](../../../album-shelf/src/renderer/src/AlbumSearchModal.vue) 添加载荷
- **已知取舍**：存量行在回填前继续走文本拆分回退（行为与今天一致）；`' / '` 分隔符统一后新数据的 artist 文本与老数据略不同，属预期规范化
