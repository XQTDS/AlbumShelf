## ADDED Requirements

### Requirement: 通过 child_process 调用 ncm-cli 命令

系统 SHALL 提供一个通用服务，通过 `child_process.execFile` 调用全局安装的 `ncm-cli` 命令行工具，并解析 JSON 格式的输出。

#### Scenario: 成功调用 ncm-cli 命令

- **WHEN** 调用 `execute<T>(args)` 方法，ncm-cli 返回 `code: 200` 的 JSON
- **THEN** 系统 SHALL 解析返回的 JSON 并返回 `data` 字段的内容，类型为 `T`

#### Scenario: ncm-cli 返回业务错误

- **WHEN** ncm-cli 返回 `code` 不为 200 的 JSON（如参数错误）
- **THEN** 系统 SHALL 抛出错误，包含 ncm-cli 返回的 `message` 信息

#### Scenario: ncm-cli 执行超时

- **WHEN** ncm-cli 命令执行超过 15 秒未返回
- **THEN** 系统 SHALL 终止子进程并抛出超时错误

#### Scenario: ncm-cli 未安装或不可用

- **WHEN** `ncm-cli` 命令不存在或不在 PATH 中
- **THEN** 系统 SHALL 抛出错误，说明 ncm-cli 不可用