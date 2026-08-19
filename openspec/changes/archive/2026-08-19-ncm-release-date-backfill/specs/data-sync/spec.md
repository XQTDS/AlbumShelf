## MODIFIED Requirements

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

## ADDED Requirements

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
