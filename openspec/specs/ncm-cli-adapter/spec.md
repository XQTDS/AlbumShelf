## ADDED Requirements

### Requirement: 通过 Electron 内置 Node 调用内置 ncm-cli 命令

系统 SHALL 提供一个通用服务，通过 `child_process.execFile` 以 `ELECTRON_RUN_AS_NODE=1` 环境变量启动应用自身运行时（`process.execPath`）作为 Node 进程，执行随应用打包的 `@music163/ncm-cli` 入口文件（`require.resolve` 解析，打包环境映射至 `app.asar.unpacked`），并解析 JSON 格式的输出。

#### Scenario: 成功调用 ncm-cli 命令

- **WHEN** 调用 `execute<T>(args)` 方法，ncm-cli 返回 `code: 200` 的 JSON
- **THEN** 系统 SHALL 解析返回的 JSON 并返回 `data` 字段的内容，类型为 `T`

#### Scenario: ncm-cli 返回业务错误

- **WHEN** ncm-cli 返回 `code` 不为 200 的 JSON（如参数错误）
- **THEN** 系统 SHALL 抛出错误，包含 ncm-cli 返回的 `message` 信息

#### Scenario: ncm-cli 执行超时

- **WHEN** ncm-cli 命令执行超过 15 秒未返回
- **THEN** 系统 SHALL 终止子进程并抛出超时错误

#### Scenario: 内置 ncm-cli 不可用

- **WHEN** 内置 ncm-cli 入口文件缺失（依赖未安装或安装包不完整）或子进程启动失败
- **THEN** 系统 SHALL 抛出错误，说明内置 ncm-cli 不可用及其可能原因

#### Scenario: 不依赖系统 Node 与全局安装

- **WHEN** 应用在未安装 Node.js 与全局 ncm-cli 的机器上运行
- **THEN** 系统 SHALL 仍能通过 Electron 内置 Node 执行内置 ncm-cli 完成数据查询（不依赖 PATH 中的 node 或 ncm-cli）

### Requirement: 拉取用户收藏专辑列表

系统 SHALL 通过 `ncm-cli album collected` 命令分页获取用户收藏的专辑列表。

#### Scenario: 单页拉取

- **WHEN** 调用 `getCollectedAlbumsPage(limit, offset)`
- **THEN** 系统 SHALL 执行 `ncm-cli album collected --limit <limit> --offset <offset>` 并解析返回的 `records` 数组

#### Scenario: 返回结构解析

- **WHEN** 命令返回 code 200 的 JSON
- **THEN** 系统 SHALL 解析每条记录中的 `id`（加密 ID）、`originalId`（明文 ID）、`name`、`artists`、`coverImgUrl`、`publishTime` 等字段

#### Scenario: 需要登录

- **WHEN** 未登录状态下调用 album collected
- **THEN** 系统 SHALL 抛出 NcmLoginRequiredError，由上层引导用户登录

### Requirement: 获取专辑热门评论

系统 SHALL 通过 `ncm-cli comment list-hot --type album --resourceId <albumId> --limit <limit> --offset <offset>` 命令获取指定专辑的热门评论。

#### Scenario: 成功获取热评

- **WHEN** 调用 `getAlbumHotComments(albumId, limit, offset)`
- **THEN** 系统 SHALL 执行 `comment list-hot --type album` 并解析返回的 `records` 数组与 `recordCount`

#### Scenario: 返回结构解析

- **WHEN** 命令返回 code 200 的 JSON
- **THEN** 系统 SHALL 解析每条记录中的 `content`、`likedCount`、`creator`（nickname、avatarUrl）、`time` 等字段

#### Scenario: 分页参数

- **WHEN** 调用时传入 `limit` 与 `offset`
- **THEN** 系统 SHALL 以 `--limit <limit> --offset <offset>` 形式传递给 ncm-cli

### Requirement: 应用内设置网易云 API 凭证

系统 SHALL 在设置界面提供网易云开放平台 API 凭证（appId + privateKey）的配置能力，主进程通过内置 ncm-cli 的 `config set` 命令以非交互方式完成配置，全程不依赖 TTY、不弹出终端窗口。

#### Scenario: 保存凭证成功

- **WHEN** 用户在设置界面输入非空 appId 与 privateKey 并点击保存
- **THEN** 系统 SHALL 校验参数非空，执行 `config set appId <appId>`，将 privateKey 写入系统临时目录的随机名临时文件（不含换行）后以 `config set privateKey <临时文件路径>` 传入，随后删除临时文件
- **AND** 凭证写入 `~/.config/ncm-cli/credentials.enc.json`（ncm-cli 加密存储），登录状态（tokens.enc.json）不受影响
- **AND** 系统 SHALL 读回 appId 校验写入结果与预期一致后向界面返回成功

#### Scenario: 保存凭证失败

- **WHEN** `config set` 命令退出码非 0（如无效配置项）或读回校验不一致
- **THEN** 系统 SHALL 返回失败并将 ncm-cli 输出的中文错误信息透传给设置界面展示

#### Scenario: 私钥保护

- **WHEN** 保存流程执行中或执行后
- **THEN** 私钥 SHALL NOT 出现在子进程 argv、应用日志、临时文件残留（finally 清理）与界面回显中；界面仅允许掩码输入

#### Scenario: 获取凭证配置状态

- **WHEN** 设置界面打开并请求凭证状态
- **THEN** 系统 SHALL 执行 `config get appId` 并解析输出：`appId: <值> (凭证文件)` 判定为已配置并返回 appId；`appId: (未配置)` 判定为未配置
- **AND** 输出格式不合预期时（如含"(凭证文件)"但无法解析值）兜底返回"已配置"且 appId 为 null
- **AND** ncm-cli 不可用或执行失败时降级返回"未配置"，不抛出错误

#### Scenario: 配置先于登录

- **WHEN** 应用处于未登录状态（无 tokens.enc.json）时保存凭证
- **THEN** 配置操作 SHALL 正常完成；数据命令在登录前仍按既有行为报登录所需错误（manifest 门控）