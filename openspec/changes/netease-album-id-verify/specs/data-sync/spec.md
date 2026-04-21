## MODIFIED Requirements

### Requirement: 单张专辑追加到 CSV

系统 SHALL 支持将单张专辑追加到 CSV 文件，用于搜索添加场景。同时支持更新已有专辑在 CSV 中的 netease_id。

#### Scenario: 追加新专辑

- **WHEN** 用户通过搜索添加一张新专辑
- **THEN** 系统 SHALL 将专辑信息（title, artist, netease_id）追加到 album-collection.csv 文件末尾

#### Scenario: CSV 文件不存在

- **WHEN** CSV 文件不存在时追加专辑
- **THEN** 系统 SHALL 创建新的 CSV 文件（包含表头），然后写入该专辑

#### Scenario: 写入前备份

- **WHEN** 追加专辑到 CSV 文件
- **THEN** 系统 SHALL 先创建 .bak 备份文件，再执行写入操作

#### Scenario: 更新已有专辑的 netease_id

- **WHEN** 修复某张专辑的 netease_album_id 后需要回写 CSV
- **THEN** 系统 SHALL 通过 title + artist 定位 CSV 中对应行，更新其 netease_id 字段为新值
