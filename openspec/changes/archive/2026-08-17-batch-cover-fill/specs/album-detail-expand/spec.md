## ADDED Requirements

### Requirement: 批量补全缺失封面

系统 SHALL 提供批量补全功能，为所有 `cover_url` 为空且存在有效 `netease_album_id` 的专辑，通过 ncm-cli 拉取封面 URL 并持久化到数据库。

#### Scenario: 菜单触发批量补全

- **WHEN** 用户点击数据菜单中的「补全缺失封面」
- **THEN** 系统 SHALL 顺序遍历所有缺失封面的专辑，逐个调用 `getAlbumDetail` 获取 `coverImgUrl` 并更新数据库
- **THEN** 系统 SHALL 在顶部显示进度条，包含当前进度、总数与当前专辑标题

#### Scenario: 补全完成统计

- **WHEN** 批量补全结束
- **THEN** 系统 SHALL 刷新专辑列表并提示成功、失败数量
- **THEN** 失败或未补全的专辑在下一次补全时 SHALL 再次被处理

#### Scenario: 未登录

- **WHEN** 触发补全时 ncm-cli 未登录，或补全过程中登录失效
- **THEN** 系统 SHALL 中止补全并弹出登录窗口

#### Scenario: 单张失败不中断

- **WHEN** 某张专辑拉取封面失败（超时、网络错误或网易云无封面）
- **THEN** 系统 SHALL 将其计入失败数量并继续处理后续专辑

#### Scenario: 补全进行中防重入

- **WHEN** 封面补全正在进行时再次触发
- **THEN** 系统 SHALL 拒绝新的补全请求并提示正在进行中
