## Why

MusicBrainz 精确匹配依赖艺术家名完全一致，但现实中同一位艺术家常有不同写法（如"王菲"与"王靖雯"），导致匹配失败。同时，当前的 6 个匹配策略（Q1/Q2/Q3 精确 + F1/F2/F3 模糊）是硬编码的，用户无法根据自己的数据特点调整策略组合。此外，当前批量补全时模糊匹配结果在最后统一确认，用户确认结果无法即时反馈到后续匹配中。

## What Changes

- **新增艺术家别名机制**：维护一份 `artist-aliases.json` 文件（跟随代码仓库），在精确匹配和模糊匹配的查询构建中，对每个策略先用原名查询，再用别名查询（B-2 优先级），别名为单向映射
- **自动别名学习**：当用户确认模糊匹配候选且 MB 艺术家名与本地不同时，自动将 MB 艺术家名追加到别名文件中
- **匹配策略开关**：6 个匹配策略（Q1/Q2/Q3 + F1/F2/F3）均可独立开关，设置存储在 `userData/settings.json`，所有策略默认开启
- **批量补全逐条确认**：**BREAKING** 批量补全流程从"全部跑完后统一确认"改为"每遇到模糊匹配候选立即暂停，弹窗让用户确认后再继续"，确认后学到的别名可即时用于后续专辑匹配

## Capabilities

### New Capabilities
- `artist-alias`: 艺术家别名管理，包括别名文件读写、别名查找、自动学习
- `enrich-settings`: 数据补全设置管理，包括匹配策略开关的读写和 `settings.json` 文件管理

### Modified Capabilities
- `data-enrichment`: 匹配流程需整合别名查询、策略开关、逐条确认机制

## Impact

- **后端代码**：`enrich-service.ts` 的 `buildSearchQueries()`、`buildFuzzyQueries()`、`enrichAlbum()`、`enrichAll()` 需重构；新增 `artist-aliases.json` 文件读写模块；新增 `settings.json` 文件读写模块；`confirmMatch()` 新增别名学习逻辑
- **IPC 层**：`ipc-handlers.ts` 需新增逐条确认的双向通信（主进程发送 fuzzy-confirm 事件 → 前端弹窗 → 前端 invoke 回传结果）；移除当前的 `_pendingMatches` 批量暂存机制
- **前端**：`FuzzyMatchModal.vue` 从批量列表确认改为单条弹窗确认；需要新增策略开关 UI（可后续迭代）
- **新增文件**：`artist-aliases.json`（仓库内）、`settings.json`（运行时 userData 目录）
- **打包影响**：`artist-aliases.json` 需要在打包后仍可写入，需处理 asar 路径问题（建议使用 extraResources）