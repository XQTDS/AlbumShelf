## Requirements

### Requirement: 退出时停止播放

系统 SHALL 在应用退出前停止正在进行的播放会话，避免播放器进程（ncm-cli 的独立播放后端）在应用关闭后继续播放。

#### Scenario: 播放中退出

- **WHEN** 应用退出（before-quit）且播放器状态为 `playing`
- **THEN** 系统 SHALL 执行 `ncm-cli queue clear` 停止播放，随后关闭数据库并完成退出

#### Scenario: 暂停中退出

- **WHEN** 应用退出且播放器状态为 `paused`
- **THEN** 系统 SHALL 同样执行 `queue clear`，结束播放会话

#### Scenario: 无播放活动

- **WHEN** 应用退出且播放器状态为 `stopped`（或状态查询失败、状态未知）
- **THEN** 系统 SHALL NOT 执行停止命令，直接退出

#### Scenario: 退出限时

- **WHEN** 退出前停止播放流程执行超过 5 秒（ncm-cli 命令异常、超时等）
- **THEN** 系统 SHALL 放弃等待继续退出；停止失败仅记录日志，不阻塞退出、不向用户报错
