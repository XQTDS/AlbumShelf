# Tasks

## 1. 数据层

- [x] 1.1 `artist-service.ts`：新增 `RegionStats` 类型与 `getRegionStats()`，复用 `getUsedRegions()` 并统计 `totalAlbums` / `albumsWithRegion`。

## 2. IPC / preload

- [x] 2.1 `ipc-handlers.ts`：新增 `region:stats` handler。
- [x] 2.2 `preload/index.ts`：新增 `regionStats()` 与 `onMenuRegionStats()`。
- [x] 2.3 `preload/index.d.ts`：补全 `regionStats` 与 `onMenuRegionStats` 类型。
- [x] 2.4 `main/index.ts`：「工具」菜单新增「地区统计」，发送 `menu:regionStats`。

## 3. 渲染层

- [x] 3.1 新增 `RegionStatsModal.vue`：loading / 空状态 / 汇总卡 / 全部地区条形图 / 点击行发出 `selectRegion`。
- [x] 3.2 `App.vue`：import、弹窗状态、菜单监听与卸载清理、Esc 屏蔽、`handleSelectRegionFromStats()`。

## 4. 文档与收尾

- [x] 4.1 新增 `openspec/specs/region-stats/spec.md` 并归档 change。
- [x] 4.2 更新 `openspec/specs/album-list-ui/spec.md`：从地区统计弹窗选择地区。
- [x] 4.3 更新 `openspec/specs/genre-stats/spec.md`：与实现对齐（全部风格、菜单入口、可点击）。
- [x] 4.4 更新 `README.md`：功能列表与工具菜单说明。
