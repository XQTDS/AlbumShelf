# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-11-13-album-region-tags/` 变更文档（proposal/design/tasks）
- [x] 调研网易云字段与 MusicBrainz artist country/area 覆盖率（60 张本机库样本，93.3% 可解析）

## 主进程 — 数据层

- [x] `database.ts`：
  - 新增 `CREATE_ARTIST_TABLE`（`musicbrainz_artist_id` UNIQUE、`name`、`sort_name`、`country`、`area`、`region`、`region_fetched_at`、`created_at`、`updated_at`）与 `idx_artist_region`
  - `initDatabase` 在建表阶段创建 artist 表（在 album 迁移之前）
  - album 迁移块守卫式添加 `primary_artist_mbid TEXT REFERENCES artist(musicbrainz_artist_id)` 与 `region_checked_at TEXT`，并建 `idx_album_primary_artist_mbid`
  - `ExportData.version` 升到 3，导出 `artists`；`ImportData` 接受 1/2/3
  - `importDatabase` 先 upsert artists，再导入 album；UPDATE/INSERT 列清单加入 `primary_artist_mbid`、`region_checked_at`；`ImportResult` 增加 `artistsImported`
- [x] 新增 `region.ts`：`normalizeRegion()`、`regionLabel()`、国家/地区/城市映射表
- [x] 新增 `artist-service.ts`：`ArtistRow`、`upsertArtist()`、`getArtistByMbid()`、`getUsedRegions()`

## 主进程 — 补全与查询

- [x] `enrich-service.ts`：
  - `MbMatchResult` 增加 `artist: MbArtistRegion | null`、`artistResolveFailed: boolean`
  - `matchAlbum` / `processConfirmedMatch` lookup include 加 `'artist-credits'`
  - 新增 `resolveArtistRegion()`：credit 的 country 优先；缺失时查本地 artist 表，仍未命中则 artist lookup；服务内 MBID 缓存
  - `enrichAlbum` / `processConfirmedMatch` 写入 artist 表与 album 的 `primary_artist_mbid` / `region_checked_at`
  - 新增 `backfillRegions(onProgress?)` 与 `RegionBackfillResult`；与批量补全互斥（后按用户要求移除）
- [x] `album-service.ts`：
  - `Album` 增加 `primary_artist_mbid`、`region`、`region_area`、`region_label`
  - `AlbumUpdate` 增加 `primary_artist_mbid?`、`region_checked_at?`
  - `AlbumQueryOptions` 增加 `region?`
  - `getAlbumById` / `getAlbumByNeteaseAlbumId` / `queryAlbums` 统一 LEFT JOIN artist 并填充 `region_label`
  - `queryAlbums` 支持 `region` 条件；count 查询同步 join
  - 新增 `getAlbumsPendingRegionBackfill()`（后随回填入口移除）
- [x] `ipc-handlers.ts`：
  - `album:filters` 返回 `regions`
  - 新增 `region:backfill`（发送 `enrich:progress`，返回统计）（后按用户要求移除）
  - 导出结果统计增加 artists

## 预加载与渲染层

- [x] `preload/index.ts` / `index.d.ts`：
  - `AlbumQueryOptions.region`
  - `Album.primary_artist_mbid` / `region` / `region_area` / `region_label`
  - `albumFilters` 返回 `regions: { key, label, count }[]`
  - 新增 `regionBackfill()` 与 `onMenuBackfillRegions()`（后按用户要求移除）
- [x] `src/main/index.ts`：数据菜单新增「补全艺人地区」（后按用户要求移除）
- [x] `App.vue`：
  - `Album` 接口与 `filterRegions` / `selectedRegion` 状态
  - 艺术家单元格内地区 chip（绿色系）
  - 详情面板「地区」元数据
  - 工具栏地区下拉筛选；`buildAlbumQueryOptions` 加 `region`
  - 行 `v-memo` 依赖加 `region_label` / `region_area`
  - 随机选择、播放条封面定位清空 `selectedRegion`
  - 菜单「补全艺人地区」处理函数与完成提示（后按用户要求移除）
  - 风格 `.artist-cell` / `.region-tag` / `.region-filter-select` 样式

## 修订（2026-11-16）

- [x] 用户完成一次性存量地区回填后，按要求移除「补全艺人地区」入口与死代码：主进程菜单、`region:backfill` IPC、preload `regionBackfill` / `onMenuBackfillRegions`、`EnrichService.backfillRegions` / `RegionBackfillResult` / `backfillingRegions`、`AlbumService.getAlbumsPendingRegionBackfill`、`App.vue` 处理函数与监听
- [x] 同步修订 `artist-region` / `data-enrichment` / `local-storage` / `album-list-ui` spec 与 README：不再提供批量回填入口；旧备份导入后的新专辑通过重新补全/重新同步触发地区解析

## Spec、README 与收尾

- [x] 新增 `openspec/specs/artist-region/spec.md`
- [x] 更新 `openspec/specs/local-storage/spec.md`（artist 表、album 新列、导出导入 v3）
- [x] 更新 `openspec/specs/data-enrichment/spec.md`（artist-credits、artist lookup、地区写入、失败重试、重置）
- [x] 更新 `openspec/specs/album-list-ui/spec.md`（地区 chip、地区筛选）
- [x] 更新 `openspec/specs/album-detail-expand/spec.md`（地区元数据）
- [x] 更新 `README.md`（功能说明、导出格式；回填入口移除后同步修订）
- [x] 用户手动 `npm run dev` 验证（已完成一次性存量地区回填）
- [x] 归档 change 到 `openspec/changes/archive/`
