## MODIFIED Requirements

### Requirement: SyncService 接口预留

系统 SHALL 定义 SyncService 抽象接口，当前使用 MockSyncService 实现，待 ncm-cli 支持收藏专辑列表后可无缝切换为 NcmCliSyncService。

#### Scenario: Mock 数据可用

- **WHEN** 使用 MockSyncService 时
- **THEN** 系统 SHALL 从 CSV 文件读取专辑数据，返回包含 title 和 artist 的专辑列表

#### Scenario: 接口切换

- **WHEN** ncm-cli 未来支持收藏专辑列表功能后
- **THEN** 仅需实现 NcmCliSyncService 并替换注入，无需修改上层调用逻辑

#### Scenario: CSV 同步后回写

- **WHEN** MockSyncService 同步完成且获得 netease_id
- **THEN** 系统 SHALL 将 netease_id 回写到 CSV 文件对应的专辑行
