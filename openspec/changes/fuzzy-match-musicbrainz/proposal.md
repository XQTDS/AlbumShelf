## Why

当前 MusicBrainz 补全使用 Lucene 短语精确匹配，当本地专辑标题与 MusicBrainz 上的标题存在差异时（如标题中包含艺术家名前缀 "Tim Berne's Fractured Fairy Tales" vs MB 上的 "Fractured Fairy Tales"，或包含 Deluxe Edition 等后缀），匹配会完全失败，导致该专辑无法获得评分和风格标签。需要增加模糊查询能力，并让用户确认模糊匹配结果，以提高补全覆盖率同时保证数据准确性。

## What Changes

- 在精确匹配完全失败（无结果或 score < 50）时，新增模糊查询降级策略：
  - F1: 检测并去除标题中的艺术家名前缀后重新搜索
  - F2: 去除标题中的括号后缀（如 Deluxe Edition、Remastered 等）后重新搜索
  - F3: 使用 Lucene 分词搜索（去掉 releasegroup 字段的引号）进行更宽松的匹配
- 模糊查询的结果不自动应用，而是选出 1 个最佳候选存入内存中的"待确认"列表
- 批量补全完成后，返回待确认列表给前端
- 前端新增"待确认"面板，用户可逐个确认或跳过模糊匹配结果
- 用户确认后，系统获取该候选的详细信息（ratings、genres）并写入数据库

## Capabilities

### New Capabilities
- `fuzzy-match-confirm`: 模糊匹配与用户确认流程，涵盖模糊查询策略（F1/F2/F3）、待确认数据结构、确认/拒绝操作、以及前端待确认面板的交互

### Modified Capabilities
- `data-enrichment`: 补全流程新增模糊匹配分支 — 精确匹配失败时触发模糊查询，enrichAll 返回值新增 pending 数据，进度回调新增模糊匹配状态

## Impact

- **后端 enrich-service.ts**: 新增 `buildFuzzyQueries()` 方法、`PendingMatch` 接口、`matchAlbum()` 增加模糊分支、`enrichAll()` 返回值扩展
- **后端 ipc-handlers.ts**: 新增 `enrich:confirmMatch` 和 `enrich:rejectMatch` IPC 处理器
- **preload/index.ts**: 暴露 `enrichConfirmMatch()` 和 `enrichRejectMatch()` API
- **前端组件**: 新增待确认面板 UI
- **API 调用量**: 模糊查询会增加 API 调用（精确匹配失败时最多 +3 次查询/专辑），受现有频率限制保护
