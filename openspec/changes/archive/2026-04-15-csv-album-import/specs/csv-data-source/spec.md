## ADDED Requirements

### Requirement: CSV 文件读取

系统 SHALL 支持从 CSV 文件读取专辑列表数据，文件格式为 `title,artist,netease_id` 三列。

#### Scenario: 读取完整 CSV 文件

- **WHEN** 系统读取 `data/album-collection.csv` 文件
- **THEN** 系统 SHALL 解析所有行，返回包含 title、artist、netease_id 的专辑对象数组

#### Scenario: 处理空的 netease_id

- **WHEN** CSV 中某行的 netease_id 列为空
- **THEN** 系统 SHALL 将该字段设为 undefined，不影响其他字段的解析

#### Scenario: 处理特殊字符

- **WHEN** CSV 中的 title 或 artist 包含逗号、引号等特殊字符
- **THEN** 系统 SHALL 正确解析被引号包裹的字段内容

#### Scenario: 文件不存在

- **WHEN** CSV 文件不存在
- **THEN** 系统 SHALL 抛出明确的错误信息，指明文件路径

### Requirement: CSV 文件回写

系统 SHALL 支持将 netease_id 回写到 CSV 文件，用于追踪同步状态。

#### Scenario: 批量回写 netease_id

- **WHEN** 同步完成后调用回写功能
- **THEN** 系统 SHALL 根据 title+artist 匹配，将新获取的 netease_id 写入对应行

#### Scenario: 回写前备份

- **WHEN** 执行回写操作前
- **THEN** 系统 SHALL 先将原文件备份为 `.bak` 后缀文件

#### Scenario: 保持未匹配行不变

- **WHEN** 某行的专辑在同步结果中不存在
- **THEN** 系统 SHALL 保持该行原样，不修改任何字段

### Requirement: CSV 文件路径配置

系统 SHALL 使用项目根目录下的 `data/album-collection.csv` 作为默认数据文件路径。

#### Scenario: 默认路径

- **WHEN** 未指定自定义路径时
- **THEN** 系统 SHALL 使用 `<project-root>/data/album-collection.csv`
