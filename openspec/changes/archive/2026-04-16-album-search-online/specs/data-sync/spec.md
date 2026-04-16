## ADDED Requirements

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

- **WHEN** 前端请求已收藏专辑的 netease_original_id 列表
- **THEN** 系统 SHALL 返回所有已收藏专辑的 netease_original_id 数组（不含 null 值）
