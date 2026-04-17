## MODIFIED Requirements

### Requirement: 新专辑自动补全

系统 SHALL 在新专辑入库后，自动通过 MusicBrainz API 匹配并补全该专辑的评分和风格标签。当精确匹配失败时，系统 SHALL 尝试模糊查询并将候选结果交由用户确认。

#### Scenario: 同步后自动触发补全

- **WHEN** 同步操作完成且有新专辑写入本地数据库
- **THEN** 系统 SHALL 自动对每个尚未补全的新专辑发起 MusicBrainz 匹配，无需用户手动操作

#### Scenario: 匹配成功

- **WHEN** MusicBrainz 搜索 Release Group（按专辑名 + 艺术家名）返回结果
- **THEN** 系统 SHALL 取 score 最高的结果，获取其 ratings 和 tags，写入本地数据库的对应字段

#### Scenario: 精确匹配失败时触发模糊查询

- **WHEN** MusicBrainz 精确搜索无结果或所有结果 score < 50
- **THEN** 系统 SHALL 触发模糊查询策略（见 fuzzy-match-confirm 能力），将候选暂存到待确认列表，不标记该专辑的 enriched_at

#### Scenario: 完全匹配失败

- **WHEN** 精确匹配和模糊查询均无结果，或 API 调用失败
- **THEN** 该专辑的 mb_rating 和 genres 字段保持为空，标记 enriched_at 避免重复尝试，不影响其他专辑的补全流程，不阻塞 UI

### Requirement: 补全进度反馈

系统 SHALL 在批量补全时向用户展示进度信息，并在完成后报告模糊匹配待确认数量。

#### Scenario: 批量补全进行中

- **WHEN** 有多个专辑需要补全且补全正在进行
- **THEN** 系统 SHALL 显示当前进度（如"正在补全 3/15"）

#### Scenario: 批量补全完成后返回待确认数量

- **WHEN** 批量补全完成
- **THEN** 系统 SHALL 返回补全结果统计，包含 matched（精确匹配成功数）、failed（完全失败数）、pending（模糊匹配待确认数）和 total（总数）
