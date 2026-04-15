## Context

当前 `MockSyncService` 在代码中硬编码了 15 条专辑数据。用户的真实收藏（约 2298 张专辑）已通过截图识别导出到 `data/album-collection.md`，格式为 Markdown 表格。

需要将数据源从硬编码改为可维护的 CSV 文件，并支持同步后回写 netease_id 以追踪同步状态。

## Goals / Non-Goals

**Goals:**
- 从 CSV 文件读取专辑数据供 MockSyncService 使用
- 同步完成后将 netease_id 回写到 CSV
- 提供 MD 转 CSV 的一次性迁移脚本
- 保持现有同步流程不变

**Non-Goals:**
- 不改变 SyncService 接口定义
- 不涉及 UI 变更
- 不处理 CSV 文件的版本控制或冲突合并

## Decisions

### Decision 1: CSV 文件格式

**选择**: 使用简单的三列 CSV：`title,artist,netease_id`

```csv
title,artist,netease_id
"Time Out","Dave Brubeck Quartet",
"OK Computer","Radiohead",9077220C672889E105D6F8FCC420B144
```

**理由**:
- 最小化字段，只保留必要信息
- netease_id 为空表示未同步，有值表示已同步
- Excel/Numbers 可直接编辑

**备选方案**:
- YAML/JSON：结构化但手动编辑不便
- 保留 MD 格式：解析复杂，不便于回写

### Decision 2: CSV 读写库

**选择**: 使用 `csv-parse` 和 `csv-stringify`（Node.js 生态成熟库）

**理由**:
- 处理引号、逗号转义等边界情况
- 支持流式处理大文件
- TypeScript 类型支持良好

### Decision 3: 回写时机

**选择**: 同步完成后批量回写

**理由**:
- 避免频繁磁盘写入
- 同步失败时 CSV 保持不变，符合预期

### Decision 4: CSV 文件位置

**选择**: `data/album-collection.csv`（项目根目录）

**理由**:
- 与源代码分离，便于单独维护
- 用户可直接用 Excel 编辑
- 可选择是否纳入版本控制

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| CSV 文件被误删或损坏 | 回写前先备份为 `.bak` 文件 |
| 大文件读取性能 | 2000+ 条记录，内存占用可控，无需流式处理 |
| 中文/特殊字符编码 | 强制 UTF-8 编码，CSV 库自动处理引号转义 |
| 并发写入冲突 | 单用户桌面应用，不考虑并发场景 |

## Open Questions

- [ ] 是否需要支持多个 CSV 文件来源（如不同平台的收藏）？暂定：否
