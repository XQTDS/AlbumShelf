## MODIFIED Requirements

### Requirement: 新专辑自动补全

系统 SHALL 在新专辑入库后，自动通过 MusicBrainz API 匹配并补全该专辑的评分和风格标签。

#### Scenario: 同步后自动触发补全

- **WHEN** 同步操作完成且有新专辑写入本地数据库
- **THEN** 系统 SHALL 自动对每个尚未补全的新专辑发起 MusicBrainz 匹配，无需用户手动操作

#### Scenario: 匹配成功

- **WHEN** MusicBrainz 搜索 Release Group（按专辑名 + 艺术家名及其别名）返回结果
- **THEN** 系统 SHALL 取 score 最高的结果，获取其 ratings 和 tags，写入本地数据库的对应字段

#### Scenario: 精确匹配失败后模糊匹配产生候选

- **WHEN** 精确匹配（Q1/Q2/Q3，含别名变体）全部失败，但模糊匹配（F1/F2/F3，含别名变体）产生候选结果
- **THEN** 系统 SHALL 立即暂停批量补全流程，向前端发送候选列表，等待用户确认或拒绝后再继续处理下一个专辑

#### Scenario: 用户确认模糊匹配候选

- **WHEN** 用户在逐条确认弹窗中选择了某个候选
- **THEN** 系统 SHALL 调用 MusicBrainz lookup 获取该候选的 ratings 和 genres，写入数据库，并检查是否需要学习新别名

#### Scenario: 用户拒绝模糊匹配候选

- **WHEN** 用户在逐条确认弹窗中拒绝所有候选
- **THEN** 系统 SHALL 标记该专辑 enriched_at 避免重复尝试，继续处理下一个专辑

#### Scenario: 匹配失败

- **WHEN** MusicBrainz 精确匹配和模糊匹配均无结果，或 API 调用失败
- **THEN** 该专辑的 mb_rating 和 genres 字段保持为空，不影响其他专辑的补全流程，不阻塞 UI

### Requirement: 补全进度反馈

系统 SHALL 在批量补全时向用户展示进度信息。

#### Scenario: 批量补全进行中

- **WHEN** 有多个专辑需要补全且补全正在进行
- **THEN** 系统 SHALL 显示当前进度（如"正在补全 3/15"）

#### Scenario: 模糊匹配逐条确认

- **WHEN** 批量补全过程中某个专辑进入模糊匹配确认环节
- **THEN** 系统 SHALL 弹出单条确认弹窗，展示专辑信息和候选列表，等待用户选择后继续补全流程