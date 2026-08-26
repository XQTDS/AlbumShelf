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
- **THEN** 系统 SHALL 映射加密 ID 为 netease_album_id、明文 ID 为 netease_original_id、艺术家数组以 `/` 连接为 artist、publishTime 时间戳按北京时间（UTC+8）换算为 release_date、coverImgUrl 为 cover_url

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

### Requirement: 批量回填缺失发行日期

系统 SHALL 提供菜单入口「补全缺失发行日期」，通过 `ncm-cli album get` 的 publishTime 为 `release_date` 为空的专辑批量回填发行日期。

#### Scenario: 回填范围

- **WHEN** 用户触发发行日期回填
- **THEN** 系统 SHALL 仅处理 release_date 为空且 netease_album_id 非空的专辑，已有发行日期（含 MB 补全所得）不被覆盖

#### Scenario: 回填执行

- **WHEN** 逐张处理缺失发行日期的专辑
- **THEN** 系统 SHALL 调用 `ncm-cli album get --albumId <id>` 获取 publishTime，按北京时间换算为 release_date 后写入数据库，并在 UI 推送进度（当前/总数/专辑名/成功数）

#### Scenario: 无日期来源

- **WHEN** 网易云返回的专辑详情不含 publishTime
- **THEN** 系统 SHALL 计入失败数量，不写入 release_date

#### Scenario: 失败增量收敛

- **WHEN** 单张回填失败（网络错误等）
- **THEN** 系统 SHALL 计入失败数量并继续处理后续专辑，不重试；重新运行回填时仅处理仍缺日期的专辑，天然增量收敛

#### Scenario: 登录前置检查

- **WHEN** 触发回填时未登录网易云
- **THEN** 系统 SHALL 触发登录弹窗并中止回填，不执行批量调用

#### Scenario: 登录中途失效

- **WHEN** 回填过程中登录失效（ncm-cli 返回需要登录错误）
- **THEN** 系统 SHALL 弹登录窗并中止回填，返回已处理的统计

#### Scenario: 防重入

- **WHEN** 回填正在进行中再次触发
- **THEN** 系统 SHALL 拒绝本次触发并提示正在执行中

### Requirement: 同步保留艺术家 ID

同步与在线添加链路 SHALL 将网易云返回的艺术家 ID（明文 originalId + 加密 id）随专辑一并落库到 `album.artist_ids`（JSON 数组，下标与 `artist` 文本按 `/\s*\/\s*/` 拆分后的名字顺序对齐），为后续按 artistId 查询网易云数据（如关注艺术家的新专辑）铺路。

#### Scenario: 同步新增写入

- **WHEN** 同步新增一张专辑
- **THEN** 系统 SHALL 将 `record.artists.map(a => ({ originalId: a.originalId, id: a.id }))` 序列化写入 artist_ids，与同步生成的 artist 文本同源产出、天然对齐

#### Scenario: 已存在专辑不覆盖

- **WHEN** 同步发现某张专辑已存在（按 netease_album_id 匹配）
- **THEN** 系统 SHALL 仅跳过，不写 artist_ids（沿用「已存在专辑不改动」不变量）

#### Scenario: 在线添加写入

- **WHEN** 用户通过在线搜索添加一张专辑
- **THEN** 系统 SHALL 将搜索结果的艺术家 ID 数组写入 artist_ids（与 `' / '` 分隔的艺术家文本对齐）

#### Scenario: 存量惰性回填

- **WHEN** 老库专辑的 artist_ids 为 NULL
- **THEN** 系统 SHALL 提供菜单「数据 → 回填艺术家 ID」批量回填（详见 artist-follow spec），同步流程 SHALL NOT 主动改写存量专辑

### Requirement: 批量回填缺失艺术家 ID

系统 SHALL 提供菜单入口「回填艺术家 ID」，通过 `ncm-cli album get` 的 artists 字段为 `artist_ids` 为 NULL 的专辑批量回填网易云艺术家 ID。

#### Scenario: 回填范围

- **WHEN** 用户触发艺术家 ID 回填
- **THEN** 系统 SHALL 仅处理 artist_ids 为空且 netease_album_id 非空的专辑，已有值不被覆盖

#### Scenario: 回填执行

- **WHEN** 逐张处理缺失艺术家 ID 的专辑
- **THEN** 系统 SHALL 调用 `ncm-cli album get --albumId <id>` 取 detail.artists，将 ID 数组序列化写入 artist_ids，并在 UI 推送进度（当前/总数/专辑名/成功数），每次调用间隔 300ms

#### Scenario: 详情无艺术家

- **WHEN** 网易云返回的专辑详情不含 artists
- **THEN** 系统 SHALL 计入失败数量，不写入 artist_ids

#### Scenario: 登录前置检查与中途失效

- **WHEN** 触发回填时未登录，或回填过程中登录失效
- **THEN** 系统 SHALL 弹登录窗并中止回填，返回已处理统计

#### Scenario: 防重入

- **WHEN** 回填正在进行中再次触发
- **THEN** 系统 SHALL 拒绝本次触发并提示正在执行中

#### Scenario: 回填完成后补齐关注记录 ID

- **WHEN** 艺术家 ID 回填完成（含登录失效中止前已回填的部分）
- **THEN** 系统 SHALL 按名字匹配为缺失 ID 的关注记录补齐网易云艺术家 ID（详见 artist-follow spec），补齐条数计入回填结果
