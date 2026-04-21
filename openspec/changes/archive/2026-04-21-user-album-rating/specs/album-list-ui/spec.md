## MODIFIED Requirements

### Requirement: 专辑列表表格展示

系统 SHALL 以表格形式展示本地数据库中的专辑列表，包含以下列：序号、专辑名、艺术家、我的评分、MB评分、风格、发行日期。

#### Scenario: 表格渲染

- **WHEN** 用户打开应用或数据发生变更后
- **THEN** 系统 SHALL 在主界面以表格形式展示所有专辑，每行显示：序号（自动编号）、专辑名（title）、艺术家（artist）、我的评分（user_rating，只读星星图标+数字）、MB评分（mb_rating）、风格（关联的 genre 标签）、发行日期（release_date）

#### Scenario: 我的评分列 — 已评分

- **WHEN** 一张专辑的 user_rating 不为 NULL
- **THEN** 该行"我的评分"列 SHALL 以只读星星图标和数字形式显示评分值（如 ★★★★☆ 4.0）

#### Scenario: 我的评分列 — 未评分

- **WHEN** 一张专辑的 user_rating 为 NULL
- **THEN** 该行"我的评分"列 SHALL 显示 "—"

#### Scenario: 空状态

- **WHEN** 本地数据库中没有任何专辑
- **THEN** 系统 SHALL 显示空状态提示，引导用户点击"同步"按钮

### Requirement: 按评分排序

系统 SHALL 支持点击 MB 评分列头进行升序/降序排序。

#### Scenario: 升序排序

- **WHEN** 用户点击 MB 评分列头使其为升序状态
- **THEN** 表格 SHALL 按 mb_rating 升序排列，无评分的专辑排在最后

#### Scenario: 降序排序

- **WHEN** 用户点击 MB 评分列头使其为降序状态
- **THEN** 表格 SHALL 按 mb_rating 降序排列，无评分的专辑排在最后

## ADDED Requirements

### Requirement: 按用户评分排序

系统 SHALL 支持点击"我的评分"列头进行升序/降序排序。

#### Scenario: 降序排序

- **WHEN** 用户点击"我的评分"列头使其为降序状态
- **THEN** 表格 SHALL 按 user_rating 降序排列，未评分的专辑排在最后

#### Scenario: 升序排序

- **WHEN** 用户点击"我的评分"列头使其为升序状态
- **THEN** 表格 SHALL 按 user_rating 升序排列，未评分的专辑排在最后
