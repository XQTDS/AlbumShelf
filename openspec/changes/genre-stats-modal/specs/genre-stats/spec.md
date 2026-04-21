## ADDED Requirements

### Requirement: 风格统计数据查询

系统 SHALL 提供查询接口，返回所有风格标签及其关联的专辑数量，以及收藏总数和有风格标签的专辑数。

#### Scenario: 查询完整统计数据

- **WHEN** 渲染进程调用 `genreStats()` API
- **THEN** 系统 SHALL 返回 `{ stats: [{name: string, count: number}], totalAlbums: number, albumsWithGenre: number }`，其中 `stats` 按 `count` 降序排列

#### Scenario: 无风格数据时

- **WHEN** 数据库中没有任何 genre 记录（`genre` 表为空或 `album_genre` 表为空）
- **THEN** 系统 SHALL 返回 `{ stats: [], totalAlbums: <实际专辑数>, albumsWithGenre: 0 }`

### Requirement: 风格统计弹窗展示

系统 SHALL 提供独立弹窗，以纯 CSS 水平条形图展示 Top 15 风格及其专辑数量。

#### Scenario: 打开风格统计弹窗

- **WHEN** 用户点击工具栏中的「📊 风格统计」按钮
- **THEN** 系统 SHALL 弹出模态框，请求并展示风格统计数据

#### Scenario: 条形图展示 Top 15 风格

- **WHEN** 统计数据中风格数量超过 15 个
- **THEN** 弹窗 SHALL 展示前 15 个风格的水平条形图（条形宽度相对于最大值按比例缩放），并在最后一行展示"其他"汇总（剩余风格的数量之和）

#### Scenario: 风格数量不超过 15 个

- **WHEN** 统计数据中风格数量 ≤ 15
- **THEN** 弹窗 SHALL 展示所有风格的条形图，不显示"其他"行

#### Scenario: 辅助统计信息

- **WHEN** 弹窗展示风格统计数据
- **THEN** 弹窗顶部 SHALL 显示收藏总数和有风格标签的专辑数

#### Scenario: 空状态展示

- **WHEN** 统计数据中 `stats` 为空数组
- **THEN** 弹窗 SHALL 显示空状态提示"暂无风格数据，请先同步并补全专辑信息"

#### Scenario: 关闭弹窗

- **WHEN** 用户点击弹窗右上角关闭按钮或弹窗外部遮罩
- **THEN** 弹窗 SHALL 关闭