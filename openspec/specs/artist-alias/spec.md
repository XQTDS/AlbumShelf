## Requirements

### Requirement: 别名文件存储

系统 SHALL 在代码仓库 `album-shelf/src/main/enrich/` 目录下维护一份 `artist-aliases.json` 文件，用于存储艺术家别名映射。

#### Scenario: 别名文件格式

- **WHEN** 系统读取 `artist-aliases.json` 文件
- **THEN** 文件内容 SHALL 为 JSON 对象，key 为本地艺术家名（字符串），value 为别名数组（字符串数组）

#### Scenario: 别名文件不存在

- **WHEN** 系统启动时 `artist-aliases.json` 文件不存在
- **THEN** 系统 SHALL 创建一个空的 JSON 对象文件 `{}`

### Requirement: 别名查找

系统 SHALL 提供根据本地艺术家名查找其所有别名的能力。

#### Scenario: 查找已有别名

- **WHEN** 查找的艺术家名在别名文件中存在对应条目
- **THEN** 系统 SHALL 返回该艺术家的所有别名列表

#### Scenario: 查找无别名的艺术家

- **WHEN** 查找的艺术家名在别名文件中不存在对应条目
- **THEN** 系统 SHALL 返回空数组

### Requirement: 自动别名学习

系统 SHALL 在用户确认模糊匹配候选后，自动将新的艺术家名映射追加到别名文件中。

#### Scenario: MB 艺术家名与本地不同

- **WHEN** 用户确认某个模糊匹配候选，且 MB 返回的艺术家名（忽略大小写和首尾空格后）与本地艺术家名不同
- **THEN** 系统 SHALL 将 MB 艺术家名追加到本地艺术家名的别名列表中，并同步写入 `artist-aliases.json` 文件

#### Scenario: MB 艺术家名与本地相同

- **WHEN** 用户确认某个模糊匹配候选，且 MB 返回的艺术家名（忽略大小写和首尾空格后）与本地艺术家名相同
- **THEN** 系统 SHALL 不做任何别名写入操作

#### Scenario: 别名去重

- **WHEN** 待追加的别名已存在于该艺术家的别名列表中
- **THEN** 系统 SHALL 跳过追加操作，不产生重复条目

#### Scenario: 多艺术家场景

- **WHEN** 本地艺术家名包含多个艺术家（空格分隔）
- **THEN** 系统 SHALL 取第一个艺术家名与 MB 艺术家名进行比较和别名学习

### Requirement: 别名嵌入查询

系统 SHALL 在构建 MusicBrainz 搜索查询时，将别名嵌入到每个策略中。

#### Scenario: 精确匹配查询中使用别名

- **WHEN** 系统构建精确匹配查询（Q1/Q2/Q3）
- **THEN** 对每个启用的策略，系统 SHALL 先用原艺术家名生成查询，再依次用每个别名生成同策略的查询

#### Scenario: 模糊匹配查询中使用别名

- **WHEN** 系统构建模糊匹配查询（F1/F2/F3）
- **THEN** 对每个启用的策略，系统 SHALL 先用原艺术家名生成查询，再依次用每个别名生成同策略的查询

#### Scenario: 无别名时行为不变

- **WHEN** 当前艺术家无已知别名
- **THEN** 查询构建行为 SHALL 与改造前完全一致，仅使用原名
