## MODIFIED Requirements

### Requirement: 风格统计弹窗展示

系统 SHALL 提供独立弹窗，以纯 CSS 水平条形图展示**全部**风格及其专辑数量，每个风格条目可点击触发筛选。

#### Scenario: 打开风格统计弹窗

- **WHEN** 用户点击工具栏中的「📊 风格统计」按钮
- **THEN** 系统 SHALL 弹出模态框，请求并展示风格统计数据

#### Scenario: 条形图展示全部风格

- **WHEN** 弹窗成功加载到风格统计数据
- **THEN** 弹窗 SHALL 展示**所有**风格的水平条形图（条形宽度相对于最大值按比例缩放），按 `count` 降序排列，不再做 Top N 截断，也不再展示「其他」汇总行

#### Scenario: 辅助统计信息

- **WHEN** 弹窗展示风格统计数据
- **THEN** 弹窗顶部 SHALL 显示收藏总数、有风格标签的专辑数与风格种类数

#### Scenario: 空状态展示

- **WHEN** 统计数据中 `stats` 为空数组
- **THEN** 弹窗 SHALL 显示空状态提示「暂无风格数据，请先同步并补全专辑信息」

#### Scenario: 关闭弹窗

- **WHEN** 用户点击弹窗右上角关闭按钮或弹窗外部遮罩
- **THEN** 弹窗 SHALL 关闭

## ADDED Requirements

### Requirement: 风格条目可点击触发筛选

系统 SHALL 让风格统计弹窗中的每个风格条目可点击，点击后将该风格加入当前已选风格筛选并关闭弹窗。

#### Scenario: 视觉提示可点击

- **WHEN** 鼠标悬停在风格条目上
- **THEN** 系统 SHALL 通过 `cursor: pointer`、行背景高亮和风格名颜色变化提示该条目可点击；同时通过 `title` 提示「点击筛选『XXX』」

#### Scenario: 点击触发筛选

- **WHEN** 用户在弹窗内点击某一风格条目
- **THEN** 系统 SHALL 将该风格名追加到主界面的多风格筛选（`selectedGenres`）中，并按新筛选条件重新加载专辑列表

#### Scenario: 点击后关闭弹窗

- **WHEN** 用户在弹窗内点击某一风格条目
- **THEN** 弹窗 SHALL 在触发筛选后立即关闭，使用户回到主列表查看结果

#### Scenario: 重复点击已选风格

- **WHEN** 被点击的风格已存在于 `selectedGenres` 中
- **THEN** 系统 SHALL 不重复添加，但仍然关闭弹窗

## REMOVED Requirements

### Requirement: 条形图展示 Top 15 风格

**Reason**: 用户希望在弹窗中直接查看并筛选所有风格，Top 15 截断 + 「其他」汇总反而限制了发现路径。
**Migration**: 由「条形图展示全部风格」场景替代，移除 `TOP_N=15` 截断与「其他」聚合行。

### Requirement: 风格数量不超过 15 个

**Reason**: 不再以 15 为分界，所有数量场景统一展示全部风格。
**Migration**: 由「条形图展示全部风格」场景统一覆盖。
