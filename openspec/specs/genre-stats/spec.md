## Requirements

### Requirement: 风格统计数据查询

系统 SHALL 提供查询接口，返回所有风格标签及其关联的专辑数量，以及收藏总数和有风格标签的专辑数。

#### Scenario: 查询完整统计数据

- **WHEN** 渲染进程调用 `genreStats()` API
- **THEN** 系统 SHALL 返回 `{ stats: [{name: string, count: number}], totalAlbums: number, albumsWithGenre: number }`，其中 `stats` 按 `count` 降序排列

#### Scenario: 无风格数据时

- **WHEN** 数据库中没有任何 genre 记录（`genre` 表为空或 `album_genre` 表为空）
- **THEN** 系统 SHALL 返回 `{ stats: [], totalAlbums: <实际专辑数>, albumsWithGenre: 0 }`

### Requirement: 风格统计弹窗展示

系统 SHALL 提供独立弹窗，以纯 CSS 水平条形图展示全部风格及其专辑数量，每个风格条目可点击触发筛选。

#### Scenario: 打开风格统计弹窗

- **WHEN** 用户点击菜单「工具 → 风格统计」
- **THEN** 系统 SHALL 弹出模态框，请求并展示风格统计数据

#### Scenario: 条形图展示全部风格

- **WHEN** 弹窗成功加载到风格统计数据
- **THEN** 弹窗 SHALL 展示所有风格的水平条形图（条形宽度相对于最大值按比例缩放），按 `count` 降序排列
- **AND** SHALL NOT 做 Top N 截断，SHALL NOT 展示「其他」汇总行

#### Scenario: 辅助统计信息

- **WHEN** 弹窗展示风格统计数据
- **THEN** 弹窗顶部 SHALL 显示收藏总数、有风格标签的专辑数与风格种类数

#### Scenario: 空状态展示

- **WHEN** 统计数据中 `stats` 为空数组
- **THEN** 弹窗 SHALL 显示空状态提示「暂无风格数据，请先同步并补全专辑信息」

#### Scenario: 关闭弹窗

- **WHEN** 用户点击弹窗右上角关闭按钮或弹窗外部遮罩
- **THEN** 弹窗 SHALL 关闭

### Requirement: 风格条目可点击触发筛选

系统 SHALL 让风格统计弹窗中的每个风格条目可点击，点击后将该风格加入当前已选风格筛选并关闭弹窗。

#### Scenario: 视觉提示可点击

- **WHEN** 鼠标悬停在风格条目上
- **THEN** 系统 SHALL 通过 `cursor: pointer`、行背景高亮和风格名颜色变化提示该条目可点击
- **AND** SHALL 通过 `title` 提示「点击筛选『XXX』」

#### Scenario: 点击触发筛选

- **WHEN** 用户在弹窗内点击某一风格条目
- **THEN** 系统 SHALL 将该风格名追加到主界面的多风格筛选（`selectedGenres`）中，并按新筛选条件重新加载专辑列表

#### Scenario: 点击后关闭弹窗

- **WHEN** 用户在弹窗内点击某一风格条目
- **THEN** 弹窗 SHALL 在触发筛选后立即关闭

#### Scenario: 重复点击已选风格

- **WHEN** 被点击的风格已存在于 `selectedGenres` 中
- **THEN** 系统 SHALL 不重复添加，但仍然关闭弹窗
