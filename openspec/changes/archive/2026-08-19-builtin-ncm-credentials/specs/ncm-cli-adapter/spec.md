## MODIFIED Requirements

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
