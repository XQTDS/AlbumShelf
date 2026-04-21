## Requirements

### Requirement: 一键触发批量校验

系统 SHALL 提供"校验专辑 ID"按钮在工具栏中，用户点击后批量校验所有有 `netease_album_id` 的专辑的正确性。

#### Scenario: 触发校验

- **WHEN** 用户点击工具栏的"校验专辑 ID"按钮
- **THEN** 系统 SHALL 遍历所有有 `netease_album_id` 的专辑，逐个调用 `getAlbumDetail()` 获取远程专辑信息

#### Scenario: 校验中按钮禁用

- **WHEN** 校验正在进行中
- **THEN** "校验专辑 ID"按钮 SHALL 显示为加载状态并禁用，防止重复触发

### Requirement: 校验匹配逻辑

系统 SHALL 使用忽略大小写 + trim 后精确匹配来判断本地 title 与远程 name 是否一致。

#### Scenario: 匹配通过

- **WHEN** 本地 `title.trim().toLowerCase()` 等于远程 `name.trim().toLowerCase()`
- **THEN** 该专辑视为匹配正确，跳过无需处理

#### Scenario: 匹配不通过

- **WHEN** 本地 `title.trim().toLowerCase()` 不等于远程 `name.trim().toLowerCase()`
- **THEN** 该专辑标记为"不匹配"，加入 mismatch 列表，记录本地 title/artist 和远程返回的 name/artists

#### Scenario: 单条校验失败

- **WHEN** 某张专辑调用 `getAlbumDetail()` 失败（网络错误、超时等）
- **THEN** 该专辑标记为"校验失败"并继续处理下一张，不中断整个校验流程

### Requirement: 校验进度反馈

系统 SHALL 在校验过程中实时推送进度信息给前端。

#### Scenario: 进度推送

- **WHEN** 每完成一张专辑的校验
- **THEN** 系统 SHALL 通过 IPC event 推送当前进度（已校验数 / 总数）给前端

#### Scenario: 前端进度展示

- **WHEN** 前端收到进度 event
- **THEN** 前端 SHALL 展示校验进度条和当前进度文字（如 "正在校验 23/150..."）

### Requirement: API 限流

系统 SHALL 在批量校验时对 `getAlbumDetail()` 调用加入间隔控制，避免触发网易云 API 限流。

#### Scenario: 调用间隔

- **WHEN** 批量校验过程中连续调用 `getAlbumDetail()`
- **THEN** 每次调用间 SHALL 至少间隔 300ms

### Requirement: 不匹配列表展示与逐个确认

系统 SHALL 在校验完成后展示所有不匹配的专辑列表，用户逐个确认修复。

#### Scenario: 校验完成展示结果

- **WHEN** 批量校验完成
- **THEN** 系统 SHALL 弹出 IdVerifyModal 展示不匹配列表，包含每条的本地 title/artist 和远程返回的 name/artists

#### Scenario: 自动搜索候选

- **WHEN** 用户在 IdVerifyModal 中查看某条不匹配的专辑
- **THEN** 系统 SHALL 自动用本地 `title + " " + artist` 调用 `searchAlbum()` 获取候选结果列表

#### Scenario: 用户选择候选修复

- **WHEN** 用户从搜索候选中选择一个正确的专辑
- **THEN** 系统 SHALL 使用选中候选的 `id` 和 `originalId` 修复该专辑的 `netease_album_id`、`netease_original_id` 和 `title`

#### Scenario: 用户手动输入 album ID

- **WHEN** 搜索候选中无正确结果，用户手动输入网易云专辑 ID
- **THEN** 系统 SHALL 通过 `getAlbumDetail()` 查询该 ID 对应的专辑详情，展示给用户确认后执行修复

#### Scenario: 用户跳过

- **WHEN** 用户选择"跳过"某条不匹配的专辑
- **THEN** 系统 SHALL 不做任何修改，继续展示下一条

#### Scenario: 全部处理完成

- **WHEN** 所有不匹配专辑都已确认或跳过
- **THEN** IdVerifyModal SHALL 关闭，前端刷新专辑列表

### Requirement: 修复后重新同步

系统 SHALL 在修复 `netease_album_id` 后自动重新同步曲目、封面并回写 CSV。

#### Scenario: 重新同步曲目

- **WHEN** 某张专辑的 `netease_album_id` 被修复
- **THEN** 系统 SHALL 清除该专辑的旧曲目记录，使用新 ID 重新调用 `getAlbumTracks()` 拉取曲目

#### Scenario: 重新获取封面

- **WHEN** 某张专辑的 `netease_album_id` 被修复
- **THEN** 系统 SHALL 使用新 ID 调用 `getAlbumDetail()` 获取正确的 `coverImgUrl` 并更新数据库

#### Scenario: 回写 CSV

- **WHEN** 某张专辑的 `netease_album_id` 被修复
- **THEN** 系统 SHALL 通过 title + artist 定位 CSV 中对应行，更新其 netease_id 字段
