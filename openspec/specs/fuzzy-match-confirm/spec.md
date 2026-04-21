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
- **THEN** 系统 SHALL 仅保留 score >= 50 的候选项，并使用与精确匹配相同的 pickBestReleaseGroup 逻辑选出最佳候选

### Requirement: 模糊匹配结果不自动应用

模糊匹配的结果 SHALL 不自动写入数据库，MUST 经过用户确认后才应用。

#### Scenario: 模糊匹配成功时暂存候选

- **WHEN** 模糊查询找到最佳候选
- **THEN** 系统 SHALL 将候选信息（含本地专辑 ID、本地标题、MB 标题、MB 艺术家信用、MBID、score、首发日期）暂存到内存中的待确认列表，不标记该专辑的 enriched_at

#### Scenario: 模糊匹配时不预取详细信息

- **WHEN** 模糊查询找到候选
- **THEN** 系统 SHALL 不立即调用 MusicBrainz lookup API 获取 ratings 和 genres，推迟到用户确认后执行

### Requirement: 用户确认模糊匹配

系统 SHALL 在批量补全完成后，向用户展示待确认的模糊匹配列表，支持确认和跳过操作。

#### Scenario: 批量补全完成后展示待确认列表

- **WHEN** 批量补全完成且待确认列表不为空
- **THEN** 系统 SHALL 弹出确认面板，展示所有待确认项目，每项显示本地标题、MB 标题对比、MB 艺术家信用和匹配分数

#### Scenario: 用户确认匹配

- **WHEN** 用户选中待确认项目并点击确认
- **THEN** 系统 SHALL 对选中的每个项目调用 MusicBrainz lookup API 获取 ratings 和 genres，写入数据库，并标记 enriched_at

#### Scenario: 用户跳过匹配

- **WHEN** 用户关闭确认面板或未选中某些项目
- **THEN** 未确认的专辑 SHALL 不标记 enriched_at，下次补全时仍可重新尝试

### Requirement: 待确认列表的全选与批量操作

确认面板 SHALL 支持全选和全不选操作，方便用户批量处理。

#### Scenario: 默认全选

- **WHEN** 确认面板打开
- **THEN** 所有待确认项目 SHALL 默认为选中状态

#### Scenario: 全选与全不选

- **WHEN** 用户点击全选或全不选按钮
- **THEN** 系统 SHALL 相应地选中或取消选中所有项目
