## Requirements

### Requirement: 实体介质标记数据存储

系统 SHALL 在 album 表中维护 `physical_media` 字段（TEXT 类型，可空），用于存储用户拥有的实体介质标记。

#### Scenario: 标记值域

- **WHEN** 用户提交实体介质标记
- **THEN** 系统 SHALL 仅接受集合 {vinyl, cd, cassette} 的子集，按展示顺序（黑胶 → CD → 磁带）排序后以逗号分隔字符串存储（如 `'vinyl,cd'`）

#### Scenario: 空集合存储

- **WHEN** 用户清空某专辑的全部介质标记
- **THEN** 系统 SHALL 将 `physical_media` 写入 NULL（语义同"未标记"）

#### Scenario: 同步不覆盖用户标记

- **WHEN** 应用执行数据同步、补全或重新同步
- **THEN** 专辑的 `physical_media` 字段 SHALL 保持不变（同步链路仅更新在线数据字段）

#### Scenario: 导入导出往返

- **WHEN** 用户导出数据库后重新导入
- **THEN** 专辑的 `physical_media` 标记 SHALL 完整保留

### Requirement: 介质标记 IPC 接口

系统 SHALL 提供 `album:setPhysicalMedia` IPC 接口，接受 albumId（number）和 mediaTypes（string[] | null）两个参数。

#### Scenario: 设置标记

- **WHEN** 渲染进程调用 `album:setPhysicalMedia(albumId, mediaTypes)` 且每个值均 ∈ {vinyl, cd, cassette}
- **THEN** 系统 SHALL 去重、按展示顺序排序后持久化到数据库，并返回 `{ success: true }`

#### Scenario: 清除标记

- **WHEN** 渲染进程调用 `album:setPhysicalMedia(albumId, [])` 或 `album:setPhysicalMedia(albumId, null)`
- **THEN** 系统 SHALL 将 `physical_media` 写入 NULL 并返回 `{ success: true }`

#### Scenario: 非法介质类型拒绝

- **WHEN** 提交的 mediaTypes 包含 {vinyl, cd, cassette} 之外的值或不是数组
- **THEN** 系统 SHALL 拒绝该请求并返回错误信息

#### Scenario: 专辑不存在

- **WHEN** 渲染进程调用 `album:setPhysicalMedia` 且指定的 albumId 不存在
- **THEN** 系统 SHALL 返回 `{ success: false, error: "专辑不存在 (id: …)" }`

### Requirement: 详情面板实体收藏分段按钮组

系统 SHALL 在专辑详情展开区域内提供实体介质标记控件：三枚分段按钮（黑胶/CD/磁带），可多选。

#### Scenario: 控件展示

- **WHEN** 用户展开一张专辑的详情
- **THEN** 系统 SHALL 在「我的评分」区块下方显示「实体收藏」区块，三枚分段按钮（图标+文字），已标记的介质按钮为选中态（填充高亮）

#### Scenario: 点击切换标记

- **WHEN** 用户点击某枚未选中的介质按钮
- **THEN** 系统 SHALL 立即将该介质加入标记（乐观更新）并异步保存
- **WHEN** 用户点击某枚已选中的介质按钮
- **THEN** 系统 SHALL 立即移除该介质标记（乐观更新）并异步保存

#### Scenario: 多介质共存

- **WHEN** 用户依次点击多个介质按钮
- **THEN** 同一专辑 SHALL 可同时标记多种介质，各按钮选中态相互独立

#### Scenario: 乐观更新失败回退

- **WHEN** 标记保存请求失败
- **THEN** 系统 SHALL 回退 UI 到原标记状态并显示错误提示

### Requirement: 列表视图展示介质标记

系统 SHALL 在表格视图与唱片墙视图的列表项上展示专辑的介质标记。

#### Scenario: 表格视图实体列

- **WHEN** 专辑的 `physical_media` 不为 NULL
- **THEN** 表格「实体」列 SHALL 按展示顺序并排显示对应的介质图标徽章
- **WHEN** 专辑的 `physical_media` 为 NULL
- **THEN** 表格「实体」列 SHALL 显示 "—"

#### Scenario: 唱片墙卡片角标

- **WHEN** 专辑的 `physical_media` 不为 NULL
- **THEN** 唱片墙卡片左上角 SHALL 显示介质图标角标（多枚横向并排，常驻显示）
- **WHEN** 专辑的 `physical_media` 为 NULL
- **THEN** 卡片 SHALL 不渲染介质角标

#### Scenario: 角标不遮挡既有元素

- **WHEN** 卡片显示介质角标且同时存在左下角排序角标与右下角悬停播放按钮
- **THEN** 三者 SHALL 互不重叠（介质角标位于左上角）
