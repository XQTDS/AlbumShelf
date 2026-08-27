# 同步顺带补全网易云跳转 ID

## 背景

部分专辑的详情面板不显示「🎵 网易云音乐」跳转链接（例如《Black Messiah》）。排查确认：

- 链接由 `App.vue` 中 `v-if="selectedAlbum.netease_original_id"` 控制，为空即不渲染。
- 线上库实测：2546 张专辑中 **2036 张（80%）`netease_original_id` 为 NULL**，全部来自 2026-04-16 的同一次批量导入（历史 CSV 表头仅 `title,artist,netease_id`，无明文 ID；该列是之后的数据库迁移新增）。
- 后续所有能拿到 `originalId` 的路径都不回填这一列：
  - 同步 `album collected`（每条记录现在都带 `originalId`）对已存在专辑「仅计数跳过，不修改任何字段」；
  - 发行日期回填、艺术家 ID 回填虽然调用了 `album get`（返回值含 `originalId`），但只写各自目标字段。

## 目标

- 让「同步专辑列表」在执行时，为已存在但 `netease_original_id` 为空的专辑用本次拉取的 `originalId` 顺带补写该列（**零额外 ncm-cli API 调用**），一次同步即可修复存量数据的跳转链接缺失。
- 同步结果统计中新增「补全」数量，完成提示文案体现补全张数。
- 补全仅针对空值，已有值一律不覆盖。

## 非目标

- 不新增独立的「网易云 ID 回填」菜单项（对已取消收藏的专辑无能为力的场景暂不在本次解决）。
- 不改动同步对其他字段的「已存在专辑不改动」语义：除了 `netease_original_id` 空值补全这一明确例外，artists、封面、发行日期等一律保持现状。
- 不改动搜索添加、单张专辑同步、艺术家新片动态等链路。

## 方案概述

详见 design.md。核心决策：

- **回填时机**：`SyncManager.sync` 写入阶段，对已存在（按 `netease_album_id` 匹配）且本地 `netease_original_id` 为空的专辑，若本次拉取的记录带 `originalId`，收集为补全批次。
- **持久化**：循环结束后用单个事务批量 UPDATE（`WHERE id = ? AND netease_original_id IS NULL` 双保险），避免逐条自动提交的 2036 次写放大。
- **统计口径**：`SyncResult` 增加 `backfilled`（子集统计）；`skipped` 口径不变（所有已存在专辑），保持 `added + skipped == total` 不变量。
