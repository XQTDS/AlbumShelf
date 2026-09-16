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
- **THEN** 系统 SHALL 仅计数跳过，不修改该专辑在数据库中的任何字段（唯一例外见「同步顺带补全网易云跳转 ID」requirement）

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

### Requirement: 同步进度反馈

同步过程 SHALL 通过 `sync:progress` 事件向 UI 推送进度，页面顶部显示与补全流程同款样式的进度条。

#### Scenario: 拉取阶段进度

- **WHEN** 同步处于拉取收藏列表阶段（总数未知）
- **THEN** 系统 SHALL 每拉完一页推送 `{ phase: 'fetching', current: 已拉取张数, total: null }`，UI 显示不定长动画进度条与「已获取 X 张」文案

#### Scenario: 写入阶段进度

- **WHEN** 拉取完成进入写入阶段
- **THEN** 系统 SHALL 推送 `{ phase: 'writing', current, total }`（起始 0、每处理 50 张一次、结束为总数），UI 显示按比例填充的进度条与「X/Y 张」文案

#### Scenario: 同步结束清除进度条

- **WHEN** 同步结束（成功或失败）
- **THEN** UI SHALL 清除同步进度条，最终统计仍由消息提示展示

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
- **THEN** 系统 SHALL 映射加密 ID 为 netease_album_id、明文 ID 为 netease_original_id、艺术家数组序列化为结构化 artists（JSON `[{name, originalId, id}]`）并以 `' / '` 连接名字派生 artist 展示文本、publishTime 时间戳按北京时间（UTC+8）换算为 release_date、coverImgUrl 为 cover_url

### Requirement: SyncService 接口

系统 SHALL 定义 SyncService 抽象接口，由 NcmCliSyncService 实现，返回收藏专辑列表。

#### Scenario: 接口形状

- **WHEN** 调用 SyncService.fetchCollectedAlbums()
- **THEN** 系统 SHALL 返回 NeteaseAlbum[]，包含加密 ID、明文 ID、标题、艺术家、封面、发行日期

#### Scenario: 登录检查

- **WHEN** 调用 SyncService.checkLoginStatus()
- **THEN** 系统 SHALL 通过 ncm-cli login --check 返回当前登录状态
- **AND** 自 ncm-cli 0.1.7 起 `login --check` 支持主动续期：token 过期但 refreshToken 有效时返回已登录（无需用户重新扫码）

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

#### Scenario: 搜索添加写入发行日期

- **WHEN** 搜索添加场景写入一张新专辑且搜索结果包含 publishTime
- **THEN** 系统 SHALL 将 publishTime 按北京时间换算为 release_date 一并写入，不再留空

#### Scenario: 同步后自动补全

- **WHEN** 单张专辑同步完成且 MusicBrainz 客户端可用
- **THEN** 系统 SHALL 自动触发该专辑的 MB 数据补全（评分、风格）

### Requirement: 获取已收藏专辑 ID 列表

系统 SHALL 提供接口查询所有已收藏专辑的网易云 ID，用于重复检测。

#### Scenario: 返回 ID 集合

- **WHEN** 前端请求已收藏专辑的 ID 列表
- **THEN** 系统 SHALL 返回所有已收藏专辑的 netease_original_id 和 netease_album_id（用于兼容已有数据）

### Requirement: 同步顺带补全网易云跳转 ID

同步 SHALL 利用 `album collected` 记录中的明文 ID（originalId）为已存在但 `netease_original_id` 为 NULL 的专辑顺带补写该列，修复详情面板网易云跳转链接缺失（详情面板跳转链接以 `netease_original_id` 为显示条件）。这是「已存在专辑不改动」不变量唯一例外。

#### Scenario: 补全空值

- **WHEN** 同步中发现某张已存在专辑的 `netease_original_id` 为 NULL，且本次拉取的记录带明文 `originalId`
- **THEN** 系统 SHALL 将该明文 ID 写入该专辑的 `netease_original_id`（详情面板跳转链接随同步完成刷新可见）

#### Scenario: 不覆盖已有值

- **WHEN** 已存在专辑的 `netease_original_id` 非空，或本次拉取的记录缺明文 ID
- **THEN** 系统 SHALL 不对该字段做任何写入

#### Scenario: 统计与提示

- **WHEN** 同步结束
- **THEN** 系统 SHALL 在同步结果中返回 `backfilled`（本次补全跳转 ID 的专辑数，为 skipped 子集，不改变 added + skipped == total 的口径），并在 UI 仅当 `backfilled > 0` 时在完成提示中追加「补全 X 张网易云跳转 ID」

#### Scenario: 增量收敛

- **WHEN** 后续再次同步
- **THEN** 系统 SHALL 仅对仍为 NULL 的行执行补全，二次同步的补全数量自然收敛趋零



同步与在线添加链路 SHALL 将网易云返回的艺术家数组以结构化 JSON（`[{name, originalId, id}]`）落库到 `album.artists`，并将名字以 `' / '` 连接派生 `artist` 展示文本（两者同源产出、天然对齐），替代旧的 artist_ids 下标对齐方案（艺术家名含 `/` 时会错位）。

#### Scenario: 同步新增写入

- **WHEN** 同步新增一张专辑
- **THEN** 系统 SHALL 将 `record.artists.map(a => ({ name: a.name, originalId: a.originalId, id: a.id }))` 序列化写入 artists，并以同一数组 join(' / ') 生成 artist 文本

#### Scenario: 已存在专辑不覆盖

- **WHEN** 同步发现某张专辑已存在（按 netease_album_id 匹配）
- **THEN** 系统 SHALL 仅跳过，不写 artists（沿用「已存在专辑不改动」不变量）

#### Scenario: 在线添加写入

- **WHEN** 用户通过在线搜索添加一张专辑
- **THEN** 系统 SHALL 将搜索结果的结构化艺术家数组写入 artists（与 ' / ' 分隔的艺术家文本同源派生）

#### Scenario: 存量数据不回填

- **WHEN** 老库专辑的 artists 为 NULL（历史遗留）
- **THEN** 系统 SHALL NOT 主动改写存量专辑的 artists 与其他字段，也不提供批量回填入口（`netease_original_id` 空值补全为本 spec「同步顺带补全网易云跳转 ID」的明确例外）；存量行的 artists 保持 NULL，仅删除后重新添加（或导入）时按新写入路径补齐 — 实测库中不存在此类缺失行（artists 为空 0/2564），故不保留回填入口
