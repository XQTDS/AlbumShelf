## Requirements

### Requirement: 用户评分数据存储

系统 SHALL 在 album 表中维护 `user_rating` 字段（REAL 类型，可空），用于存储用户的个人评分。

#### Scenario: 评分值域

- **WHEN** 用户提交评分
- **THEN** 系统 SHALL 仅接受以下值：0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0，或 NULL（表示未评分）

#### Scenario: 保存评分

- **WHEN** 用户对一张专辑提交合法评分值
- **THEN** 系统 SHALL 将该评分值持久化到 album 表的 `user_rating` 字段

#### Scenario: 修改评分

- **WHEN** 用户对一张已有评分的专辑提交新的评分值
- **THEN** 系统 SHALL 用新值覆盖旧值

#### Scenario: 非法评分值拒绝

- **WHEN** 提交的评分值不在合法范围内（如 0, 0.3, 5.5, 负数等）
- **THEN** 系统 SHALL 拒绝该请求并返回错误信息

### Requirement: 评分 IPC 接口

系统 SHALL 提供 `album:setRating` IPC 接口，接受 albumId（number）和 rating（number | null）两个参数。

#### Scenario: 设置评分

- **WHEN** 渲染进程调用 `album:setRating(albumId, rating)` 且参数合法
- **THEN** 系统 SHALL 更新数据库中对应专辑的 `user_rating` 字段，并返回 `{ success: true }`

#### Scenario: 专辑不存在

- **WHEN** 渲染进程调用 `album:setRating` 且指定的 albumId 不存在
- **THEN** 系统 SHALL 返回 `{ success: false, error: "专辑不存在" }`

### Requirement: 详情展开区交互式评分组件

系统 SHALL 在专辑详情展开区域内提供可交互的星级评分组件。

#### Scenario: 评分组件展示

- **WHEN** 用户展开一张专辑的详情
- **THEN** 系统 SHALL 在详情区显示 5 颗星星的评分组件，若该专辑已有用户评分则高亮对应星数，否则显示为空星

#### Scenario: 半星点击评分

- **WHEN** 用户点击评分组件中某颗星星的左半部分
- **THEN** 系统 SHALL 记录为该星的 x.5 分（如第 3 颗左半 = 2.5 分）
- **WHEN** 用户点击评分组件中某颗星星的右半部分
- **THEN** 系统 SHALL 记录为该星的 x.0 分（如第 3 颗右半 = 3.0 分）

#### Scenario: 悬浮预览

- **WHEN** 用户鼠标悬浮在评分组件的星星上
- **THEN** 系统 SHALL 高亮显示从第 1 颗星到悬浮位置对应的星数，作为评分预览

#### Scenario: 评分数字显示

- **WHEN** 专辑已有用户评分
- **THEN** 评分组件旁 SHALL 显示当前评分数字（如 "4.0"）

#### Scenario: 乐观更新

- **WHEN** 用户点击星星评分
- **THEN** 系统 SHALL 立即更新 UI 显示新评分（不等待后端响应），同时异步发送保存请求
- **WHEN** 保存请求失败
- **THEN** 系统 SHALL 回退 UI 到原评分并显示错误提示
