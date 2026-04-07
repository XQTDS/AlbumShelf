## Requirements

### Requirement: 手动触发同步

系统 SHALL 提供一个"同步"按钮，用户点击后从网易云音乐拉取收藏的专辑列表并增量更新到本地数据库。

#### Scenario: 首次同步

- **WHEN** 用户点击"同步"按钮且本地数据库为空
- **THEN** 系统从网易云音乐获取全部收藏专辑，写入本地数据库，并在 UI 中显示同步结果数量

#### Scenario: 增量同步

- **WHEN** 用户点击"同步"按钮且本地数据库已有专辑数据
- **THEN** 系统仅将网易云中新增的收藏专辑写入本地数据库，已存在的专辑不重复写入（通过 netease_id 去重）

#### Scenario: 同步中状态反馈

- **WHEN** 同步操作正在进行中
- **THEN** 同步按钮 SHALL 显示为加载状态（禁用点击），防止重复触发

### Requirement: SyncService 接口预留

系统 SHALL 定义 SyncService 抽象接口，当前使用 MockSyncService 实现，待 ncm-cli 支持收藏专辑列表后可无缝切换为 NcmCliSyncService。

#### Scenario: Mock 数据可用

- **WHEN** 使用 MockSyncService 时
- **THEN** 系统 SHALL 返回 10-20 条预设的真实专辑种子数据，覆盖不同年代、风格和艺术家

#### Scenario: 接口切换

- **WHEN** ncm-cli 未来支持收藏专辑列表功能后
- **THEN** 仅需实现 NcmCliSyncService 并替换注入，无需修改上层调用逻辑

### Requirement: 同步失败处理

系统 SHALL 在同步失败时给出明确的错误提示，不影响已有数据。

#### Scenario: 网络错误

- **WHEN** 同步过程中网络不可用或 ncm-cli 调用失败
- **THEN** 系统 SHALL 显示错误信息提示用户，本地已有数据保持不变