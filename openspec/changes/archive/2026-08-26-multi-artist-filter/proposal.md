# 多艺术家专辑的筛选修复（multi-artist-filter）

## Why

`album.artist` 以 `/` 分隔多位艺术家（如 `"A / B"`）。艺术家筛选链路有两处仍把它当作单一字符串处理：

1. **筛选建议列表污染**：`getAllArtists()` 对整串 `artist` 做 DISTINCT，输入 "A" 时建议列表同时出现 "A" 与 "A / B"（后者不是独立艺术家）。
2. **筛选漏匹配**：`queryAlbums` 的 `artist` 条件使用 `a.artist = @artist` 整串等值匹配，选 "A" 时 `"A / B"` 合作专辑不出现在结果中。

「关注艺术家」与「部分匹配筛选」（artistPartial）早已按拆分后单名匹配（见 artist-follow change），本次将下拉筛选对齐同一语义。

## What Changes

- **服务层**：`getAllArtists()` 按 `/` 拆分去重，仅返回单个艺术家名；`queryAlbums()` 的 `artist` 筛选从 SQL 整串等值匹配改为拆分后单名匹配（并入既有「JS 预计算命中 id 集合 → id IN」路径），与 `followedOnly` / `artistPartial` 单次全表扫描、AND 交集组合。
- **渲染层**：无改动（建议列表直接消费 `albumFilters` 返回的艺术家名）。

## Capabilities

### Modified Capabilities

- `album-list-ui`：艺术家筛选选项 SHALL 为拆分后的单个艺术家名；筛选 SHALL 命中包含该艺术家的多艺术家专辑

## Non-goals

- 不改 `splitArtistText` 拆分语义（含 `/` 的艺术家名如 "AC/DC" 仍按既有粒度拆分，接受）
- 不引入 album_artist 正规化表（库规模千级，预计算方案足够；注释中已预留演进路径）
- 不调整搜索（search）的艺术家匹配行为

## Impact

- **主进程**：[album-service.ts](../../../album-shelf/src/main/album-service.ts) `queryAlbums` 与 `getAllArtists`
- **渲染层**：无
- **文档**：[album-list-ui/spec.md](../../specs/album-list-ui/spec.md) 增补多艺术家场景；README 无需调整（bug 修复，功能描述不变）
