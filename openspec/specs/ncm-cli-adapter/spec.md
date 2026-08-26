## Requirements

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

### Requirement: 捆绑 mpv 的 PATH 注入

系统 SHALL 在 Windows 上把捆绑的 mpv 目录前置到 ncm-cli 子进程的 PATH 环境变量，使 ncm-cli 播放后端（PlayerDaemon 继承子进程 env 并按 PATH 解析 mpv）解析到捆绑的 mpv，实现开箱即播；非 Windows 平台与捆绑缺失时 SHALL 保持子进程环境不变。

#### Scenario: 打包版注入捆绑 mpv

- **WHEN** Windows 打包版应用启动 ncm-cli 子进程，且安装目录 `resources/mpv/mpv.exe` 存在
- **THEN** 子进程 env 的 PATH SHALL 以捆绑 mpv 目录开头（前置注入），播放命令 SHALL 使用捆绑 mpv（优先于用户自装）

#### Scenario: 开发模式注入本地 mpv

- **WHEN** Windows 开发模式（未打包）且项目 `build/mpv/mpv.exe` 存在（`npm run fetch-mpv` 产物）
- **THEN** 子进程 env 的 PATH SHALL 前置项目 `build/mpv` 目录

#### Scenario: 捆绑缺失回落

- **WHEN** Windows 上捆绑 mpv 目录不存在（开发环境未拉取），或平台非 Windows
- **THEN** 子进程 env SHALL 与现状一致（不修改 PATH），播放行为回落用户 PATH 中的 mpv

### Requirement: 拉取用户收藏专辑列表

系统 SHALL 通过 `ncm-cli album collected` 命令分页获取用户收藏的专辑列表。

#### Scenario: 单页拉取

- **WHEN** 调用 `getCollectedAlbumsPage(limit, offset)`
- **THEN** 系统 SHALL 执行 `ncm-cli album collected --limit <limit> --offset <offset>` 并解析返回的 `records` 数组

#### Scenario: 返回结构解析

- **WHEN** 命令返回 code 200 的 JSON
- **THEN** 系统 SHALL 解析每条记录中的 `id`（加密 ID）、`originalId`（明文 ID）、`name`、`artists`（结构化艺术家数组 `{name, originalId, id}`，艺术家数据真源）、`coverImgUrl`、`publishTime` 等字段

#### Scenario: 需要登录

- **WHEN** 未登录状态下调用 album collected
- **THEN** 系统 SHALL 抛出 NcmLoginRequiredError，由上层引导用户登录

### Requirement: 获取专辑详情

系统 SHALL 通过 `ncm-cli album get --albumId <albumId>` 命令获取指定专辑的详情信息。

#### Scenario: 成功获取专辑详情

- **WHEN** 调用 `getAlbumDetail(albumId)` 且命令返回 code 200 的 JSON
- **THEN** 系统 SHALL 解析返回的 `originalId`、`id`、`name`、`artists`（结构化艺术家数组 `{name, originalId, id}`，艺术家数据真源）、`coverImgUrl`、`publishTime` 等字段

#### Scenario: 发行日期换算

- **WHEN** 将专辑详情的 publishTime 换算为发行日期
- **THEN** 系统 SHALL 按北京时间（UTC+8）取日历日期（publishTime 为北京时间零点的时间戳，直接取 UTC 日期会早一天）

#### Scenario: 专辑不存在或命令失败

- **WHEN** 命令返回非 200 或专辑不存在
- **THEN** 系统 SHALL 抛出错误，由调用方处理（回填计入失败、封面获取降级返回空）

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

### Requirement: 内置网易云 API 凭证自动配置

系统 SHALL 将一套固定的网易云开放平台 API 凭证（appId + privateKey）以内置常量的形式打包进应用，并在应用启动时通过内置 ncm-cli 的 `config set` 命令以非交互方式确保写入本地配置，全程不依赖 TTY、不弹出终端窗口；设置界面 SHALL NOT 提供凭证输入入口。

#### Scenario: 首次启动自动写入

- **WHEN** 应用启动且 ncm-cli 本地配置中无凭证（`config get appId` 判定为未配置）
- **THEN** 系统 SHALL 以非交互方式执行 `config set appId <内置 appId>`，将内置 privateKey 写入系统临时目录的随机名临时文件（不含换行）后以 `config set privateKey <临时文件路径>` 传入，随后删除临时文件
- **AND** 凭证写入 `~/.config/ncm-cli/credentials.enc.json`（ncm-cli 加密存储），登录状态（tokens.enc.json）不受影响
- **AND** 系统 SHALL 读回 appId 校验写入结果与内置值一致

#### Scenario: 凭证已就绪则跳过

- **WHEN** 应用启动且读回的 appId 与内置值一致
- **THEN** 系统 SHALL 跳过写入（幂等，避免每次启动重复执行 config 命令）

#### Scenario: 凭证被篡改或不一致时恢复

- **WHEN** 本地配置中的 appId 与内置值不一致，或读回状态为"已配置但无法解析值"（appId 为 null）
- **THEN** 系统 SHALL 以内置值重写凭证，覆盖本地配置

#### Scenario: 自动写入失败不阻断启动

- **WHEN** 自动写入失败（ncm-cli 不可用、`config set` 退出码非 0 或读回校验不一致）
- **THEN** 系统 SHALL 仅记录错误日志，不阻断应用启动与窗口创建；后续数据命令按既有行为报"凭证未配置"错误

#### Scenario: 私钥保护

- **WHEN** 自动写入流程执行中或执行后
- **THEN** 内置私钥 SHALL NOT 出现在子进程 argv、应用日志与临时文件残留（finally 清理）中

#### Scenario: 获取凭证配置状态

- **WHEN** 设置界面打开并请求凭证状态
- **THEN** 系统 SHALL 执行 `config get appId` 并解析输出：`appId: <值> (凭证文件)` 判定为已配置并返回 appId；`appId: (未配置)` 判定为未配置
- **AND** 输出格式不合预期时（如含"(凭证文件)"但无法解析值）兜底返回"已配置"且 appId 为 null
- **AND** ncm-cli 不可用或执行失败时降级返回"未配置"，不抛出错误

#### Scenario: 设置界面无配置入口

- **WHEN** 用户打开设置界面
- **THEN** 界面 SHALL 仅展示只读凭证状态（未配置 / 已配置 + 掩码 appId），不提供 appId / privateKey 输入与保存入口

#### Scenario: 配置先于登录

- **WHEN** 应用处于未登录状态（无 tokens.enc.json）时自动写入凭证
- **THEN** 配置操作 SHALL 正常完成；数据命令在登录前仍按既有行为报登录所需错误（manifest 门控）

### Requirement: 艺术家命令族（预留）

系统 SHALL 在 NcmCliService 中预留艺术家命令封装区，记录 ncm-cli 0.1.6 艺术家命令族的探测结论，供后续「关注艺术家的新专辑」等能力使用；当前版本的回填功能 SHALL 复用 `album get` 的 artists 字段，不依赖 artist 命令族。

#### Scenario: 探测结论

- **WHEN** 开发者查阅预留区注释
- **THEN** 注释 SHALL 记录：`artist songs --artistId <加密ID> --startTime --endTime --limit --offset` 为艺人歌曲列表且参数要求加密艺术家 ID；`search all --keyword` 综合搜索返回含 originalId/id 的 artists 数组；无 `search artist` 子命令
- **AND** 结论 SHALL 与数据模型一致：followed_artist 同时保存 original_id 与 encrypted_id，供未来按加密 ID 调用 artist songs