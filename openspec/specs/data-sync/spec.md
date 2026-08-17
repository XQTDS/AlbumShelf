## Requirements

### Requirement: 手动触发同步

系统 SHALL 提供一个"同步"按钮，用户点击后从网易云音乐拉取收藏的专辑列表并增量更新到本地数据库。

#### Scenario: 首次同步

- **WHEN** 用户点击"同步"按钮且本地数据库为空
- **THEN** 系统从网易云音乐获取全部收藏专辑，写入本地数据库，并在 UI 中显示同步结果数量

#### Scenario: 增量同步

- **WHEN** 用户点击"同步"按钮且本地数据库已有专辑数据
- **THEN** 系统仅将网易云中新增的收藏专辑写入本地数据库，已存在的专辑不重复写入（通过 netease_id 去重）

#### Scenario: 已存在专辑不改动

- **WHEN** 同步过程中发现某张专辑已存在于数据库（按 netease_album_id 匹配）
- **THEN** 系统 SHALL 仅计数跳过，不修改该专辑在数据库中的任何字段

### Requirement: 清理已取消收藏的专辑

同步 SHALL 将本地数据库与网易云收藏列表保持一致：本地有但收藏列表中已没有的专辑将被删除。

#### Scenario: 删除已取消收藏的专辑

- **WHEN** 收藏列表完整拉取成功后，发现数据库中的某张专辑（按 netease_album_id 匹配）不在收藏列表中
- **THEN** 系统 SHALL 将其从数据库中删除（track / album_genre 通过外键级联清理），并在同步结果中计入 deleted 数量

#### Scenario: 拉取失败不删除

- **WHEN** 收藏列表拉取失败（重试耗尽抛出错误）
- **THEN** 系统 SHALL 中止同步且不执行任何删除

#### Scenario: 先增后删

- **WHEN** 同步执行新增与删除
- **THEN** 系统 SHALL 先执行新增再执行删除，避免新增失败时数据被误删

#### Scenario: 结果提示

- **WHEN** 同步完成且发生过删除
- **THEN** UI 提示 SHALL 包含删除数量（如「新增 X 张，删除 Y 张，跳过 Z 张已存在」）

#### Scenario: 同步中状态反馈

- **WHEN** 同步操作正在进行中
- **THEN** 同步按钮 SHALL 显示为加载状态（禁用点击），防止重复触发

#### Scenario: 同步仅手动触发

- **WHEN** 用户登录成功或应用启动时已登录
- **THEN** 系统 SHALL NOT 自动触发同步；同步仅由菜单栏「数据 → 同步专辑列表」入口触发

### Requirement: 同步数据源为 ncm-cli album collected

系统 SHALL 通过 NcmCliSyncService 调用 `ncm-cli album collected` 命令分页拉取用户收藏的专辑列表，作为同步的唯一数据源。

#### Scenario: 分页拉取

- **WHEN** 拉取收藏专辑列表
- **THEN** 系统 SHALL 每页固定请求 50 条，offset 步进 50，直到返回空页停止

#### Scenario: 翻页终止条件

- **WHEN** 判断是否还有下一页
- **THEN** 系统 SHALL 以返回记录为空作为终止条件，不依赖 recordCount（实测恒为 0）或单页条数

#### Scenario: 单页失败重试

- **WHEN** 某一页拉取失败（网络错误等）
- **THEN** 系统 SHALL 重试最多 2 次（间隔 1 秒），仍失败则中止同步并抛出错误

#### Scenario: 字段映射

- **WHEN** 将 ncm-cli 返回的收藏专辑记录写入数据库
- **THEN** 系统 SHALL 映射加密 ID 为 netease_album_id、明文 ID 为 netease_original_id、艺术家数组以 `/` 连接为 artist、publishTime 时间戳换算为 release_date、coverImgUrl 为 cover_url

### Requirement: SyncService 接口

系统 SHALL 定义 SyncService 抽象接口，由 NcmCliSyncService 实现，返回收藏专辑列表。

#### Scenario: 接口形状

- **WHEN** 调用 SyncService.fetchCollectedAlbums()
- **THEN** 系统 SHALL 返回 NeteaseAlbum[]，包含加密 ID、明文 ID、标题、艺术家、封面、发行日期

#### Scenario: 登录检查

- **WHEN** 调用 SyncService.checkLoginStatus()
- **THEN** 系统 SHALL 通过 ncm-cli login --check 返回当前登录状态

### Requirement: 同步失败处理

系统 SHALL 在同步失败时给出明确的错误提示，不影响已有数据。

#### Scenario: 网络错误

- **WHEN** 同步过程中网络不可用或 ncm-cli 调用失败
- **THEN** 系统 SHALL 显示错误信息提示用户，本地已有数据保持不变

### Requirement: 单张专辑同步

系统 SHALL 支持同步单张新增专辑到本地数据库，避免全量同步开销。

#### Scenario: 增量同步单张专辑

- **WHEN** 搜索添加场景写入一张新专辑
- **THEN** 系统 SHALL 仅将该专辑写入 SQLite 数据库，不重新处理已有专辑

#### Scenario: 同步后自动补全

- **WHEN** 单张专辑同步完成且 MusicBrainz 客户端可用
- **THEN** 系统 SHALL 自动触发该专辑的 MB 数据补全（评分、风格）

### Requirement: 获取已收藏专辑 ID 列表

系统 SHALL 提供接口查询所有已收藏专辑的网易云 ID，用于重复检测。

#### Scenario: 返回 ID 集合

- **WHEN** 前端请求已收藏专辑的 ID 列表
- **THEN** 系统 SHALL 返回所有已收藏专辑的 netease_original_id 和 netease_album_id（用于兼容已有数据）
