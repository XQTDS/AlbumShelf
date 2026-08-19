## Requirements

### Requirement: 专辑播放即时反馈与后台补队列

系统 SHALL 在 `player:playAlbum` 中完成「清空队列 → 播放首曲 → 确认开始播放」后立即返回成功结果，不等待剩余曲目入队；剩余曲目 SHALL 在主进程后台串行补入队列。新一轮播放或停止播放 SHALL 使上一轮未完成的后台补队列任务立即中止。

#### Scenario: 播放条即时出现

- **WHEN** 渲染层调用 `player:playAlbum`（专辑有可播放曲目）
- **THEN** 系统 SHALL 依次执行 `queue clear`、播放首曲，并以短轮询（首查约 200ms、间隔约 300ms、总超时 5s）确认播放器进入 `playing` 后立即返回 `{ success: true }`
- **AND** 剩余曲目 SHALL 在主进程后台逐首串行 `queue add`（约 1 秒/首），不阻塞 IPC 返回，渲染层播放条随返回即刻出现

#### Scenario: 播放确认超时

- **WHEN** 播放首曲后 5 秒内未能观察到 `playing` 状态
- **THEN** 系统 SHALL 返回 `{ success: false, error: '播放失败' }`，且不启动后台补队列

#### Scenario: 新一轮播放取代旧后台任务

- **WHEN** 上一轮 `player:playAlbum` 的后台补队列尚未完成时发起新一轮 `player:playAlbum`
- **THEN** 新一轮播放 SHALL 使旧后台任务失效（代际不匹配即中止），旧专辑曲目 SHALL NOT 写入新队列

#### Scenario: 停止播放取消后台补队列

- **WHEN** 后台补队列进行中调用 `player:stop`
- **THEN** 系统 SHALL 先使后台任务失效再清空队列，清空后的队列 SHALL NOT 被旧任务重新填充

#### Scenario: 后台补队列单曲失败

- **WHEN** 后台补队列中某一首 `queue add` 失败（网络异常、登录失效等）
- **THEN** 系统 SHALL 仅记录日志并继续后续曲目，SHALL NOT 中断补队列、不向用户报错、不弹出登录窗

### Requirement: 退出时停止播放

系统 SHALL 在应用退出前停止正在进行的播放会话，避免播放器进程（ncm-cli 的独立播放后端）在应用关闭后继续播放。

#### Scenario: 播放中退出

- **WHEN** 应用退出（before-quit）且播放器状态为 `playing`
- **THEN** 系统 SHALL 执行 `ncm-cli queue clear` 停止播放，随后关闭数据库并完成退出

#### Scenario: 暂停中退出

- **WHEN** 应用退出且播放会话存活（注意：ncm-cli 在 pause 后 `state.status` 也报告 `stopped`，系统以 `queueLength > 0` 判定暂停会话存活）
- **THEN** 系统 SHALL 同样执行 `queue clear`，结束播放会话

#### Scenario: 无播放活动

- **WHEN** 应用退出且播放器状态为 `stopped`（或状态查询失败、状态未知）
- **THEN** 系统 SHALL NOT 执行停止命令，直接退出

#### Scenario: 退出限时

- **WHEN** 退出前停止播放流程执行超过 5 秒（ncm-cli 命令异常、超时等）
- **THEN** 系统 SHALL 放弃等待继续退出；停止失败仅记录日志，不阻塞退出、不向用户报错

### Requirement: 播放控制与状态展示

系统 SHALL 提供播放控制 IPC 通道（暂停/恢复/上一首/下一首/跳转/查询状态/停止）与底部常驻播放条，展示正在播放的专辑/歌曲/艺术家与播放进度，并支持进度跳转。

#### Scenario: 播放控制命令

- **WHEN** 渲染层调用 `player:pause` / `player:resume` / `player:seek` / `player:stop`
- **THEN** 系统 SHALL 执行对应的 ncm-cli 命令（`pause` / `resume` / `seek <秒>` / `queue clear`）并返回 `{ success }` 结果
- **AND** `player:seek` 的秒数非有限非负数时 SHALL 直接拒绝，不执行命令

#### Scenario: 队列边界切换

- **WHEN** 当前为队列第一首时调用 `player:prev`，或为最后一首时调用 `player:next`
- **THEN** 系统 SHALL 返回 `{ success: false, boundary: true, message }` 透传 ncm-cli 的边界提示，而非抛错

#### Scenario: 状态查询

- **WHEN** 渲染层调用 `player:state`
- **THEN** 系统 SHALL 执行 `ncm-cli state` 并返回 `{ status, title, position, duration, currentIndex, queueLength }`（缺失字段容错给默认值）
- **AND** 查询失败时返回 `{ success: false }`，不抛出，轮询方保留上次状态继续重试

#### Scenario: 播放条展示

- **WHEN** 播放会话存活（发起播放成功后，或轮询观察到 `queueLength > 0`）
- **THEN** 底部常驻播放条 SHALL 展示：专辑名/歌曲名/艺术家（本地播放上下文与队列快照优先，无快照时以 `state.title` 解析兜底）、播放/暂停按钮、上一首/下一首按钮、进度条与已播/总时长

#### Scenario: 进度展示与跳转

- **WHEN** 播放中
- **THEN** 进度 SHALL 按 `state.position` / `state.duration` 自适应轮询更新（播放中 1s、暂停中 3s、停止即停），轮询间隔内按锚点线性插值平滑前进
- **AND** 用户点击或拖动进度条时，系统 SHALL 按点击位置比例换算秒数执行 `seek` 跳转

#### Scenario: 暂停状态判定

- **WHEN** 用户点击暂停（ncm-cli 在 pause 后 `state.status` 报告 `stopped`）
- **THEN** 系统 SHALL 以渲染层本地状态为权威展示暂停态，不因 `state.status` 为 `stopped` 误判会话结束

#### Scenario: 会话结束隐藏播放条

- **WHEN** 轮询观察到 `queueLength` 为 0（且此前已观察到会话存活）或用户点击停止按钮
- **THEN** 播放条 SHALL 隐藏，轮询 SHALL 停止

#### Scenario: 会话启动竞态

- **WHEN** 发起播放后立即轮询（播放器后端尚未就绪，`queueLength` 可能仍为 0）
- **THEN** 系统 SHALL 不判定会话结束；仅在曾观察到 `queueLength > 0` 之后队列清空才判定结束

### Requirement: 音量控制

系统 SHALL 提供音量控制 IPC 通道（`player:volume`）与播放条音量控件（图标静音切换 + 滑块调音量）。音量状态由应用本地管理并持久化，播放会话启动时应用到播放后端（ncm-cli 无音量读取命令，`state.volume` 恒为 null，应用只写不读）。

#### Scenario: 音量设置命令

- **WHEN** 渲染层调用 `player:volume` 且 level 为有限数值
- **THEN** 系统 SHALL 将 level 钳位到 [0, 100] 后执行 `ncm-cli volume <level>` 并返回 `{ success }`
- **AND** level 非有限数值时 SHALL 直接拒绝，不执行命令

#### Scenario: 本地音量状态与持久化

- **WHEN** 用户在播放条拖动音量滑块或点击音量图标
- **THEN** 音量值 SHALL 由渲染层本地管理并写入 localStorage（key `albumShelfPlayerVolume`），重启应用后恢复上次音量（默认 100）
- **AND** 点击音量图标 SHALL 在 0 与静音前的非零音量间切换
- **AND** 滑块拖动过程中 SHALL 仅本地预览，释放时才向主进程发送设置命令

#### Scenario: 会话启动应用音量

- **WHEN** 新的播放会话开始（应用内发起播放）
- **THEN** 系统 SHALL 将本地记忆的音量应用到播放后端，保证后端音量与 UI 一致

#### Scenario: 音量设置失败

- **WHEN** `player:volume` 执行失败（未登录、后端异常等）
- **THEN** UI 音量 SHALL 回滚到设置前的值并提示错误
