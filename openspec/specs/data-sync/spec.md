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

### Requirement: 单张专辑追加到 CSV

系统 SHALL 支持将单张专辑追加到 CSV 文件，用于搜索添加场景。

#### Scenario: 追加新专辑

- **WHEN** 用户通过搜索添加一张新专辑
- **THEN** 系统 SHALL 将专辑信息（title, artist, netease_id）追加到 album-collection.csv 文件末尾

#### Scenario: CSV 文件不存在

- **WHEN** CSV 文件不存在时追加专辑
- **THEN** 系统 SHALL 创建新的 CSV 文件（包含表头），然后写入该专辑

#### Scenario: 写入前备份

- **WHEN** 追加专辑到 CSV 文件
- **THEN** 系统 SHALL 先创建 .bak 备份文件，再执行写入操作

### Requirement: 单张专辑同步

系统 SHALL 支持同步单张新增专辑到本地数据库，避免全量同步开销。

#### Scenario: 增量同步单张专辑

- **WHEN** 新专辑写入 CSV 后触发同步
- **THEN** 系统 SHALL 仅将该专辑写入 SQLite 数据库，不重新处理已有专辑

#### Scenario: 同步后自动补全

- **WHEN** 单张专辑同步完成且 MusicBrainz 客户端可用
- **THEN** 系统 SHALL 自动触发该专辑的 MB 数据补全（评分、风格）

### Requirement: 获取已收藏专辑 ID 列表

系统 SHALL 提供接口查询所有已收藏专辑的网易云 ID，用于重复检测。

#### Scenario: 返回 ID 集合

- **WHEN** 前端请求已收藏专辑的 ID 列表
- **THEN** 系统 SHALL 返回所有已收藏专辑的 netease_original_id 和 netease_album_id（用于兼容已有数据）
