# 艺人信息窗口（artist-browser）

## Why

AlbumShelf 目前以专辑为第一视角：艺术家只是专辑列表的筛选条件或关注对象，关注列表只覆盖「已关注」子集。用户无法回答「我的库里都有哪些艺人 / 某位艺人我一共收了多少张 / 我平均给他打多少分」。

本次新增独立的「艺人信息」窗口：从库内专辑聚合**全部艺人**（包括没有匹配 MusicBrainz、只在合作专辑中出现的艺人），展示艺人名、地区、专辑数、我的平均评分，并可下钻查看该艺人的全部专辑、点击跳转主界面专辑详情。同时允许手动修正艺人地区——这是本 change 唯一的写操作。

## What Changes

- 新增只读聚合服务 `ArtistBrowserService`：以 `album.artists` 结构化 JSON 为真源，按网易云艺人 ID 归并，`artist` 表只补充地区/展示名；不新增统计表，不落库派生统计。
- 新增独立窗口 `artists.html` / `ArtistBrowserWindow.vue`，入口「工具 → 艺人信息」：左栏艺人列表（搜索/排序），右栏艺人信息 + 专辑列表。
- 新增 IPC/preload：艺人列表、某艺人专辑、地区选项、设置地区、跳转主界面专辑、关闭窗口。
- 主窗口新增跳转处理：直接选中目标专辑详情；目标不在当前列表时清空影响结果集的筛选并全量加载定位。
- 新增手动地区编辑：`artist.region_source` 标记 `manual`，自动补全不得覆盖；清除地区保持为空。
- 导出格式升为 **version 5**（artist 行新增 `region_source`），导入继续兼容 v1–v4。
- 修复旧版备份导入时 album UPDATE 会把已有结构化 `artists` 覆盖为 NULL 的问题（改为 `COALESCE`），否则艺人目录会退化为文本拆分。
- 新增 `artist-region:changed` 广播，主窗口同步刷新专辑地区 chip 与地区筛选项。

## Capabilities

### New Capabilities

- `artist-browser`：全库艺人目录、艺人详情与专辑列表、跳转主界面、手动地区编辑。

### Modified Capabilities

- `artist-region`：artist 表新增 `region_source`；手动地区覆盖与自动补全的优先级。
- `data-enrichment`：自动地区补全 SHALL NOT 覆盖手动地区。
- `local-storage`：artist 表新列、导出 version 5、导入兼容 v1–v4。

## Non-goals

- 不做关注/取关、关注状态展示（关注列表保持现有职责）。
- 不做在线艺人简介/头像/热门歌曲/完整 discography。
- 不做艺人合并、别名管理、批量地区编辑。
- 不做艺人窗口尺寸/位置持久化。
- 不做并排实时自动刷新（v1 为窗口获焦 + 手动刷新；地区修改例外，通过广播同步）。
- 不改变主界面筛选语义，不在跳转时自动应用该艺人筛选。
- 不把 MB 评分混入「平均评分」；v1 只统计我的评分。

## Impact

- **主进程**：新增 `artist-browser-service.ts`；`artist-service.ts` 新增手动地区写入并保护 `manual`；`database.ts` 新增 `artist.region_source` 列与导出 v5/导入兼容；`ipc-handlers.ts` 新增 handlers 与广播；`index.ts` 新增窗口与菜单；`region.ts` 新增地区选项/校验。
- **preload**：`index.ts` 与 `index.d.ts` 新增艺人浏览 API 与类型。
- **渲染层**：新增 `artists.html`、`artists-main.ts`、`ArtistBrowserWindow.vue`；`App.vue` 新增跳转处理、地区变更监听、筛选清理提取。
- **构建**：`electron.vite.config.ts` 新增 renderer 入口 `artists`。
- **文档**：新增 `openspec/specs/artist-browser/spec.md`；更新 `artist-region` / `data-enrichment` / `local-storage` 规范与 `README.md`。

## Known Limitations

- 只在合作位置出现、且没有 `artist` 行的艺人，本 change 会在首次手动设置地区时为其创建 `artist` 行（按网易云 ID）。
- 没有网易云 ID 的历史艺人（仅旧备份导入可能出现）无法稳定关联 `artist` 行，地区编辑按钮禁用并提示；满足「能修改艺人地区」的主路径不受影响。
- 手动地区是最终值：清空后不会被 MusicBrainz 自动补回；如需恢复自动值，需要重新设置或后续另开 change 提供「恢复自动」。