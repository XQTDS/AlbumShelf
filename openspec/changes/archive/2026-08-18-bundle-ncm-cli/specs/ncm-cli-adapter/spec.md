## MODIFIED Requirements

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
