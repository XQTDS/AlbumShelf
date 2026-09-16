# 移除三个已失效的数据维护菜单项

## 背景

数据菜单下的三个批量维护入口的功能已实质完成或已被其他机制覆盖，实测本地库（2564 张专辑）后确认它们运行起来只会得到「无需处理」的结果：

| 菜单项 | 判定依据 |
| --- | --- |
| 回填艺术家 ID | `artists` 为空的专辑 **0 张**。一次性存量迁移（CSV 导入时代的历史专辑缺结构化艺术家数据）已完成；新数据由同步/搜索添加路径直接写入结构化 `artists`，不再产生新的空缺 |
| 补全缺失封面 | `cover_url` 为空的专辑 **0 张**；且 `cover://` 协议在缓存未命中时会自动下载并落盘（[cover-cache.ts:93-127](../../../album-shelf/src/main/cover-cache.ts#L93-L127)），封面链路本身自愈 |
| 补全缺失发行日期 | `release_date` 为空的专辑 **1 张**。新写入路径（全量同步 / 搜索添加 / 单张重新同步）均已带 `publishTime`，回填已基本收敛 |

同时「回填艺术家 ID」的菜单名也已与实现不符：它回填的是结构化艺术家数据（`name` + `originalId` + `id`），不只是 ID。

## 目标

- 删除数据菜单中的「补全缺失封面」「补全缺失发行日期」「回填艺术家 ID」三个菜单项。
- 连同其整条调用链一并清理：菜单事件、IPC handler、防重入标志、service 查询方法、preload API 与类型、渲染层进度条与处理函数。
- 不留死代码；不改变任何其他功能的行为。

## 非目标

- **不删除** `同步 MusicBrainz 风格库`（保留，用户明确要求）。
- **不删除** `补全缺失MB数据的专辑` / `重新补全所有专辑`（仍有用，属低频重型工具，另案评估）。
- **不修改** `publishTimeToReleaseDate`、`ncm-cli-service.getAlbumDetail`：同步映射、搜索添加、单张重新同步、艺术家新片动态等链路仍在消费。
- **不处理** `album:resync`（单张重新同步）这条渲染层零调用的死 IPC：不在本次范围内，另案决定。
- 不引入替代入口（如把批量维护挪到设置面板）。

## 能力变更

### 移除的能力

- `data-sync`：`批量回填缺失发行日期`、`批量回填缺失结构化艺术家数据`（及「存量惰性回填」requirement 中对菜单入口的引用）
- `album-detail-expand`：`批量补全缺失封面`
- `artist-follow`：`回填完成后补齐关注记录 ID`（见下方影响说明）

### 不受影响的能力

- 同步链路对 `netease_original_id` 的顺带补全、`artists` 的结构化写入
- 数据补全（MB 匹配/评分/风格）、手动风格编辑、关注功能本体

## 影响

- **主进程**：[index.ts](../../../album-shelf/src/main/index.ts)（菜单模板）、[ipc-handlers.ts](../../../album-shelf/src/main/ipc-handlers.ts)（三个 handler 段 + 三个防重入标志）、[album-service.ts](../../../album-shelf/src/main/album-service.ts)（三个 `getAlbumsWithoutXxx` 查询）
- **附带删除**：[followed-artist-service.ts](../../../album-shelf/src/main/followed-artist-service.ts) 的 `fillMissingIdsFromAlbums()` —— 它的唯一调用点就在艺术家 ID 回填的收尾逻辑里。删除是安全的：关注记录 `original_id` 为空的数量为 **0**，且关注时的写入路径已带 ID（`COALESCE` 补齐缺失字段）
- **预加载**：[preload/index.ts](../../../album-shelf/src/preload/index.ts) / [index.d.ts](../../../album-shelf/src/preload/index.d.ts) 的 11 个 API 与对应菜单事件订阅
- **渲染层**：[App.vue](../../../album-shelf/src/renderer/src/App.vue) 的 3 条进度条 DOM、3 组 ref/处理函数/进度监听/菜单监听与卸载清理（约 120 行）
- **无数据库变更**：不涉及建表、迁移或数据写入

## 方案概述

纯删除，逐层剥离。详见 design.md。
