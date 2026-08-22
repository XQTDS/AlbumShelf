## Requirements

### Requirement: 模糊查询策略

当精确匹配失败时，系统 SHALL 按优先级依次尝试以下模糊查询策略，找到结果即停止。

#### Scenario: F1 — 去除艺术家名前缀

- **WHEN** 精确匹配失败，且专辑标题以艺术家名开头（包括所有格形式如 `'s`）
- **THEN** 系统 SHALL 去除标题中的艺术家名前缀及其后的分隔符（空格、连字符、冒号等），用剩余部分作为标题重新搜索 MusicBrainz Release Group

#### Scenario: F2 — 去除括号后缀

- **WHEN** 精确匹配失败，且专辑标题末尾包含括号内容（如 `(Deluxe Edition)`、`[Remastered]`、`（特别版）`）
- **THEN** 系统 SHALL 去除标题末尾的括号及其内容，用剩余部分作为标题重新搜索 MusicBrainz Release Group

#### Scenario: F3 — Lucene 分词搜索

- **WHEN** 精确匹配失败，且 F1、F2 均未找到结果
- **THEN** 系统 SHALL 使用 Lucene 分词搜索（去掉 releasegroup 字段的引号），按各词分别匹配而非短语精确匹配

#### Scenario: 模糊查询的质量过滤

- **WHEN** 模糊查询返回结果
- **THEN** 系统 SHALL 仅保留 score >= 50 的候选项，并取前 5 个作为候选列表

### Requirement: 模糊匹配结果不自动应用

模糊匹配的结果 SHALL 不自动写入数据库，MUST 经过用户确认后才应用。

#### Scenario: 模糊匹配时入队不阻塞

- **WHEN** 精确匹配失败，且存在模糊确认回调（批量补全、单张重新同步场景）
- **THEN** 系统 SHALL 将待确认项（本地专辑信息 + 候选列表）加入弹窗队列，不标记该专辑的 enriched_at
- **AND** 系统 SHALL 立即返回，不阻塞批量补全扫描流程

#### Scenario: 模糊匹配时不预取详细信息

- **WHEN** 模糊查询找到候选
- **THEN** 系统 SHALL 不立即调用 MusicBrainz lookup API 获取 ratings 和 genres，推迟到用户确认后执行

### Requirement: 弹窗队列依次确认

系统 SHALL 通过队列依次弹出确认弹窗（同一时刻最多一个），用户可在批量补全进行中或结束后随时处理。

#### Scenario: 依次弹出确认弹窗

- **WHEN** 队列中有一个或多个待确认项
- **THEN** 系统 SHALL 逐个弹出确认弹窗，每项展示本地专辑信息、候选对比（MB 标题、艺术家信用、匹配分数、首发日期）以及队列中剩余待确认数量

#### Scenario: 候选为空的专辑同样入队

- **WHEN** 精确匹配失败且模糊查询未产生任何候选
- **THEN** 系统 SHALL 仍弹出确认弹窗，允许用户手动粘贴 MusicBrainz 链接或跳过

#### Scenario: 用户确认匹配

- **WHEN** 用户选中候选或手动粘贴的 MB 链接并点击确认
- **THEN** 系统 SHALL 对该专辑调用 MusicBrainz lookup API 获取 ratings 和 genres，写入数据库，标记 enriched_at，并通知渲染层刷新列表与风格统计

#### Scenario: 用户跳过匹配

- **WHEN** 用户点击跳过
- **THEN** 该专辑 SHALL 标记 enriched_at，下次补全不再重复尝试

#### Scenario: 窗口销毁保护

- **WHEN** 确认弹窗等待期间主窗口销毁
- **THEN** 系统 SHALL 以"跳过"结算当前弹窗并结束队列消费，避免流程悬挂
