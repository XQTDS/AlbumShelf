## Requirements

### Requirement: 地区统计数据查询

系统 SHALL 提供查询接口，返回所有在用地区及其关联的专辑数量，以及收藏总数和有地区标签的专辑数。

#### Scenario: 查询完整统计数据

- **WHEN** 渲染进程调用 `regionStats()` API
- **THEN** 系统 SHALL 返回 `{ stats: [{key: string, label: string, count: number}], totalAlbums: number, albumsWithRegion: number }`
- **AND** `stats` SHALL 按 `count` 降序排列，同数量时按地区键升序排列
- **AND** `label` SHALL 使用地区中文展示名（如「中国台湾」「日本」），无法映射时回退原始地区键

#### Scenario: 无地区数据时

- **WHEN** 没有任何专辑关联到有地区的艺人
- **THEN** 系统 SHALL 返回 `{ stats: [], totalAlbums: <实际专辑数>, albumsWithRegion: 0 }`

#### Scenario: 只含在用地区

- **WHEN** 系统构建地区统计
- **THEN** SHALL 只包含至少关联一张专辑的地区，SHALL NOT 列出空结果地区

#### Scenario: 手动地区参与统计

- **WHEN** 艺人地区由用户在「艺人信息」窗口中手动设置
- **THEN** 统计 SHALL 按该地区计入专辑数量，与 MusicBrainz 自动补全的地区同等对待

#### Scenario: 单值计数

- **WHEN** 统计专辑的地区分布
- **THEN** 一张专辑 SHALL 最多计入一个地区（其主艺人的地区）
- **AND** 各地区的 `count` 之和 SHALL 等于 `albumsWithRegion`

### Requirement: 地区统计弹窗展示

系统 SHALL 提供独立弹窗，以纯 CSS 水平条形图展示全部在用地区及其专辑数量，每个地区条目可点击触发筛选。

#### Scenario: 打开地区统计弹窗

- **WHEN** 用户点击菜单「工具 → 地区统计」
- **THEN** 系统 SHALL 弹出模态框，请求并展示地区统计数据

#### Scenario: 展示全部地区

- **WHEN** 弹窗成功加载到地区统计数据
- **THEN** 弹窗 SHALL 展示所有地区的水平条形图（条形宽度相对于最大值按比例缩放，按 `count` 降序）
- **AND** SHALL NOT 做 Top N 截断，SHALL NOT 展示「其他」汇总行

#### Scenario: 辅助统计信息

- **WHEN** 弹窗展示地区统计数据
- **THEN** 弹窗顶部 SHALL 显示收藏总数、有地区标签的专辑数与地区数量
- **AND** SHALL 说明地区取自专辑主艺人、每张专辑最多计入一个地区

#### Scenario: 空状态展示

- **WHEN** 统计数据中 `stats` 为空数组
- **THEN** 弹窗 SHALL 显示空状态提示「暂无地区数据，请先补全 MusicBrainz 信息，或在「艺人信息」中手动设置地区」

#### Scenario: 关闭弹窗

- **WHEN** 用户点击弹窗右上角关闭按钮或弹窗外部遮罩
- **THEN** 弹窗 SHALL 关闭

### Requirement: 地区条目可点击触发筛选

系统 SHALL 让地区统计弹窗中的每个地区条目可点击，点击后将主界面的地区筛选切换为该地区并关闭弹窗。

#### Scenario: 视觉提示可点击

- **WHEN** 鼠标悬停在地区条目上
- **THEN** 系统 SHALL 通过 `cursor: pointer`、行背景高亮和地区名颜色变化提示该条目可点击
- **AND** SHALL 通过 `title` 提示「点击筛选『XXX』」

#### Scenario: 点击触发筛选

- **WHEN** 用户在弹窗内点击某一地区条目
- **THEN** 系统 SHALL 将该地区键写入主界面的单选地区筛选，并按新筛选条件重新加载专辑列表
- **AND** 新选择 SHALL 替换原有地区选择（不追加、不与其他地区做 AND）

#### Scenario: 点击后关闭弹窗

- **WHEN** 用户在弹窗内点击某一地区条目
- **THEN** 弹窗 SHALL 在触发筛选后立即关闭
