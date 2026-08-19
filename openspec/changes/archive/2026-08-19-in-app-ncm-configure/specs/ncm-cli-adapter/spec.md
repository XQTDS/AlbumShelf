## ADDED Requirements

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
