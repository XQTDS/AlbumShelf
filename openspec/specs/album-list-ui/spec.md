## Requirements

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

### Requirement: 按艺术家筛选

系统 SHALL 提供艺术家下拉筛选器，用户可选择一个或多个艺术家来过滤表格。

#### Scenario: 单选筛选

- **WHEN** 用户在艺术家下拉筛选器中选择一个艺术家
- **THEN** 表格 SHALL 仅显示该艺术家的专辑

#### Scenario: 清除筛选

- **WHEN** 用户清除艺术家筛选条件
- **THEN** 表格 SHALL 恢复显示所有专辑

### Requirement: 按风格筛选

系统 SHALL 提供风格下拉筛选器，用户可选择一个或多个风格标签来过滤表格。

#### Scenario: 单选筛选

- **WHEN** 用户在风格下拉筛选器中选择一个风格
- **THEN** 表格 SHALL 仅显示包含该风格标签的专辑

#### Scenario: 清除筛选

- **WHEN** 用户清除风格筛选条件
- **THEN** 表格 SHALL 恢复显示所有专辑

### Requirement: 按评分排序

系统 SHALL 支持点击评分列头进行升序/降序排序。

#### Scenario: 升序排序

- **WHEN** 用户点击评分列头使其为升序状态
- **THEN** 表格 SHALL 按 mb_rating 升序排列，无评分的专辑排在最后

#### Scenario: 降序排序

- **WHEN** 用户点击评分列头使其为降序状态
- **THEN** 表格 SHALL 按 mb_rating 降序排列，无评分的专辑排在最后

### Requirement: 按用户评分排序

系统 SHALL 支持点击"我的评分"列头进行升序/降序排序。

#### Scenario: 降序排序

- **WHEN** 用户点击"我的评分"列头使其为降序状态
- **THEN** 表格 SHALL 按 user_rating 降序排列，未评分的专辑排在最后

#### Scenario: 升序排序

- **WHEN** 用户点击"我的评分"列头使其为升序状态
- **THEN** 表格 SHALL 按 user_rating 升序排列，未评分的专辑排在最后

### Requirement: 按发行日期排序

系统 SHALL 支持点击发行日期列头进行升序/降序排序。

#### Scenario: 升序排序

- **WHEN** 用户点击发行日期列头使其为升序状态
- **THEN** 表格 SHALL 按 release_date 升序排列，无日期的专辑排在最后

#### Scenario: 降序排序

- **WHEN** 用户点击发行日期列头使其为降序状态
- **THEN** 表格 SHALL 按 release_date 降序排列，无日期的专辑排在最后

### Requirement: 关键词搜索

系统 SHALL 提供搜索框，支持按专辑名和艺术家进行关键词搜索。

#### Scenario: 输入搜索

- **WHEN** 用户在搜索框中输入关键词
- **THEN** 表格 SHALL 实时过滤，仅显示专辑名或艺术家名包含该关键词的专辑（不区分大小写）

#### Scenario: 清空搜索

- **WHEN** 用户清空搜索框
- **THEN** 表格 SHALL 恢复显示所有专辑（仍受筛选条件影响）

### Requirement: 筛选、排序和搜索可组合

系统 SHALL 支持筛选、排序和搜索条件同时生效。

#### Scenario: 组合使用

- **WHEN** 用户同时设置了艺术家筛选、风格筛选、关键词搜索和排序条件
- **THEN** 表格 SHALL 先应用所有筛选和搜索条件过滤数据，再按排序条件排序后展示

### Requirement: 无限滚动加载

系统 SHALL 在用户滚动到列表底部附近时自动加载更多专辑。

#### Scenario: 触发加载更多

- **WHEN** 用户滚动列表，接近底部（如距离底部 200px 以内）
- **AND** 还有更多专辑未加载
- **THEN** 系统 SHALL 自动请求并追加下一批专辑到列表末尾

#### Scenario: 加载中状态

- **WHEN** 系统正在加载更多专辑
- **THEN** 列表底部 SHALL 显示加载指示器（如 spinner）

#### Scenario: 全部加载完成

- **WHEN** 所有专辑已加载完毕
- **THEN** 系统 SHALL 不再触发加载，加载指示器 SHALL 隐藏

### Requirement: 表头固定

系统 SHALL 在滚动列表内容时保持表头固定在顶部可见。

#### Scenario: 滚动时表头可见

- **WHEN** 用户向下滚动专辑列表
- **THEN** 表头（# | 专辑 | 艺术家 | ...）SHALL 始终固定在表格区域顶部，不随内容滚动

### Requirement: 筛选/排序重置列表

系统 SHALL 在筛选或排序条件变化时重置已加载的专辑列表。

#### Scenario: 条件变化重置

- **WHEN** 用户更改筛选条件（艺术家、风格、搜索关键词）或排序方式
- **THEN** 系统 SHALL 清空已加载的专辑列表，重新从第一批开始加载

### Requirement: 隐藏原生滚动条

系统 SHALL 隐藏表格区域的原生滚动条，改用自定义进度条组件。

#### Scenario: 原生滚动条不可见

- **WHEN** 表格区域可滚动
- **THEN** 原生浏览器滚动条 SHALL 不显示

### Requirement: 同步按钮

系统 SHALL 在列表界面顶部工具栏提供"同步"按钮。

#### Scenario: 点击同步

- **WHEN** 用户点击"同步"按钮
- **THEN** 系统 SHALL 触发数据同步流程（由 data-sync 能力处理），同步完成后自动刷新表格数据