## MODIFIED Requirements

### Requirement: 详情区域展示完整专辑信息

展开的详情区域 SHALL 包含以下内容：

- 封面图（来自 cover_url，无封面时显示占位符）
- 所有风格标签（完整展示，不截断），旁边带有 ✏️ 编辑按钮可进入就地编辑态
- MusicBrainz 外部链接（基于 musicbrainz_id，字段为空时不显示）
- 网易云音乐外部链接（基于 netease_id）
- 评分人数（mb_rating_count）
- 曲目数（track_count）
- 同步时间（synced_at）
- 补全时间（enriched_at，未补全时显示"未补全"）

#### Scenario: 完整数据展示

- **WHEN** 用户展开一个已补全的专辑行
- **THEN** 详情区域显示封面图、所有风格标签（旁边有编辑按钮）、MusicBrainz 链接、网易云链接、评分人数、曲目数、同步时间和补全时间

#### Scenario: 部分数据缺失

- **WHEN** 用户展开一个未补全或部分数据为空的专辑行
- **THEN** 缺失字段使用"—"或"未补全"等占位文字，MusicBrainz 链接在 musicbrainz_id 为空时不显示，封面图为空时显示占位符，风格区域显示"—"但仍然提供编辑按钮
