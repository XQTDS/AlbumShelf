## ADDED Requirements

### Requirement: 详情面板展示网易云热评

面板详情 SHALL 在曲目列表下方展示该专辑的网易云音乐热门评论；专辑无 `netease_album_id` 时 SHALL 不显示评论区块。

#### Scenario: 选中后加载热评

- **WHEN** 用户选中一张有 `netease_album_id` 的专辑
- **THEN** 系统 SHALL 通过 `album:comments` 接口获取该专辑的热评（首屏 20 条）并在曲目列表下方渲染

#### Scenario: 评论信息展示

- **WHEN** 评论加载完成且有条评论数据
- **THEN** 每条评论 SHALL 展示：头像（加载失败时隐藏）、昵称、内容（保留换行）、点赞数、日期（YYYY-MM-DD）
- **THEN** 区块头部 SHALL 显示热评总数与刷新按钮

#### Scenario: 无网易云 ID 时隐藏区块

- **WHEN** 选中专辑的 `netease_album_id` 为空
- **THEN** 详情面板 SHALL 不显示评论区块

#### Scenario: 无评论数据

- **WHEN** 评论接口返回空列表
- **THEN** 区块 SHALL 显示"暂无评论"占位提示

#### Scenario: 加载失败

- **WHEN** 评论接口调用失败（超时、网络错误或未登录）
- **THEN** 区块 SHALL 显示失败提示（未登录时提示需要登录）与重试按钮，且 SHALL 不影响面板其他内容

### Requirement: 热评内存缓存与刷新

热评 SHALL 仅缓存在渲染进程内存中（不持久化），缓存有效期 5 分钟，且提供手动刷新。

#### Scenario: TTL 内命中缓存

- **WHEN** 用户选中专辑时，该专辑评论在 5 分钟内加载过
- **THEN** 系统 SHALL 直接使用内存缓存，不重复请求接口

#### Scenario: 超过 TTL 重新加载

- **WHEN** 用户选中专辑时，缓存超过 5 分钟
- **THEN** 系统 SHALL 重新请求评论接口并更新缓存

#### Scenario: 手动刷新

- **WHEN** 用户点击评论区块的刷新按钮
- **THEN** 系统 SHALL 忽略 TTL 立即重新请求并更新缓存与展示

#### Scenario: 应用退出后缓存失效

- **WHEN** 应用退出后重新启动
- **THEN** 评论缓存 SHALL 不存在，首次选中专辑时 SHALL 重新拉取
