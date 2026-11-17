# 地区统计（region-stats）

## Why

风格统计已经提供「各风格专辑数 + 点击条形直接筛选」的视图；地区是另一条贯穿全库的维度，但目前只能通过工具栏下拉框逐项筛选，无法一眼看出「我的收藏都来自哪些地区、各有多少张」。

地区数据本身已经齐备：`artist.region` 随 MusicBrainz 补全自动写入，也支持在「艺人信息」窗口中手动设置；`ArtistService.getUsedRegions()` 已经按专辑数降序返回 `{ key, label, count }`，与地区筛选候选同源。因此本次变更不需要改数据库、补全链路或导出格式，只需要把已有的聚合结果补上总数统计，并做成与风格统计一致的可点击弹窗。

## What Changes

- `ArtistService` 新增 `getRegionStats()`：复用 `getUsedRegions()`，补充 `totalAlbums` 与 `albumsWithRegion`。
- 新增 IPC `region:stats`，返回 `{ stats, totalAlbums, albumsWithRegion }`。
- preload 新增 `regionStats()` 与 `onMenuRegionStats()`（监听 `menu:regionStats`）。
- 菜单「工具 → 地区统计」，排在「风格统计」之后。
- 新增 `RegionStatsModal.vue`：纯 CSS 水平条形图展示全部在用地区，顶部三张汇总卡，点击条形行应用地区筛选并关闭。
- `App.vue` 接线：弹窗状态、菜单监听与清理、Esc 屏蔽、`handleSelectRegionFromStats()`。
- 新增 `openspec/specs/region-stats/spec.md`；同步修正 `genre-stats` spec 中过时的「Top 15」「工具栏按钮」描述；`album-list-ui` 补充「从统计弹窗选择地区」场景。
- README 同步功能说明与工具菜单。

## Capabilities

### New Capabilities

- `region-stats`：地区统计数据查询、弹窗展示与点击筛选。

### Modified Capabilities

- `album-list-ui`：地区筛选支持从地区统计弹窗直接写入（单选替换）。
- `genre-stats`：规范与当前实现对齐（展示全部风格、菜单入口、条目可点击）。

## Non-goals

- 不改数据库表结构、迁移、导出/导入格式。
- 不改 MusicBrainz 补全、同步、地区归一化与手动地区写入逻辑。
- 不做 Top N 截断或「其他」聚合行：地区数量在个人库中为几十个，弹窗滚动即可。
- 不做按艺人计数、百分比、评分分布等额外维度。
- 不提供「未标注地区」的可点击筛选行；未标注数量由「收藏总数 − 有地区标签」隐含表达。
- 不合并风格统计与地区统计为 Tab 式统计中心。
- 不新增工具栏按钮，入口保持菜单，与风格统计一致。

## Impact

- **主进程**：`artist-service.ts` 新增统计方法；`ipc-handlers.ts` 新增 handler；`index.ts` 新增菜单项。
- **preload**：`index.ts` / `index.d.ts` 新增 API 与类型。
- **渲染层**：新增 `RegionStatsModal.vue`；`App.vue` 新增弹窗状态、菜单监听、筛选处理和生命周期清理。
- **文档**：新增 `openspec/specs/region-stats/spec.md`；更新 `album-list-ui` / `genre-stats` spec 与 `README.md`。
