## ADDED Requirements

### Requirement: 设置文件管理

系统 SHALL 在 Electron `userData` 目录下维护一份 `settings.json` 文件，用于存储应用设置。

#### Scenario: 设置文件格式

- **WHEN** 系统读取 `settings.json` 文件
- **THEN** 文件内容 SHALL 为 JSON 对象，采用 top-level namespace 设计（如 `enrichStrategies` 为补全策略的命名空间）

#### Scenario: 设置文件不存在

- **WHEN** 系统启动时 `settings.json` 文件不存在
- **THEN** 系统 SHALL 使用内置默认值，不自动创建文件

#### Scenario: 设置文件部分缺失

- **WHEN** `settings.json` 文件存在但缺少某些设置项
- **THEN** 系统 SHALL 对缺失的设置项使用默认值，已有的设置项保持不变

### Requirement: 匹配策略开关

系统 SHALL 支持对 6 个匹配策略进行独立开关控制。

#### Scenario: 精确匹配策略开关

- **WHEN** 系统构建精确匹配查询
- **THEN** 系统 SHALL 根据以下开关决定是否生成对应策略的查询：
  - `Q1_fullTitleFullArtist`：完整标题 + 完整艺术家
  - `Q2_fullTitleFirstArtist`：完整标题 + 第一个艺术家
  - `Q3_titleFirstWordFirstArtist`：标题首词 + 第一个艺术家

#### Scenario: 模糊匹配策略开关

- **WHEN** 系统构建模糊匹配查询
- **THEN** 系统 SHALL 根据以下开关决定是否生成对应策略的查询：
  - `F1_removeArtistPrefix`：去除标题中的艺术家名前缀
  - `F2_removeParenSuffix`：去除标题末尾的括号后缀
  - `F3_luceneTokenSearch`：Lucene 分词搜索

#### Scenario: 默认值

- **WHEN** 设置文件中未配置某个策略开关
- **THEN** 该策略 SHALL 默认为开启状态（`true`）

#### Scenario: 策略关闭时的行为

- **WHEN** 某个策略的开关被设置为 `false`
- **THEN** 系统 SHALL 跳过该策略的查询生成，不发送对应的 MusicBrainz API 请求