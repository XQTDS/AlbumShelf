## ADDED Requirements

### Requirement: 新专辑自动补全

系统 SHALL 在新专辑入库后，自动通过 MusicBrainz API 匹配并补全该专辑的评分和风格标签。

#### Scenario: 同步后自动触发补全

- **WHEN** 同步操作完成且有新专辑写入本地数据库
- **THEN** 系统 SHALL 自动对每个尚未补全的新专辑发起 MusicBrainz 匹配，无需用户手动操作

#### Scenario: 匹配成功

- **WHEN** MusicBrainz 搜索 Release Group（按专辑名 + 艺术家名）返回结果
- **THEN** 系统 SHALL 取 score 最高的结果，获取其 ratings 和 tags，写入本地数据库的对应字段

#### Scenario: 匹配失败

- **WHEN** MusicBrainz 搜索无结果或 API 调用失败
- **THEN** 该专辑的 mb_rating 和 genres 字段保持为空，不影响其他专辑的补全流程，不阻塞 UI

### Requirement: MusicBrainz 认证

系统 SHALL 支持 MusicBrainz 用户名/密码认证，认证凭据通过应用设置配置。

#### Scenario: 凭据配置

- **WHEN** 用户在设置中输入 MusicBrainz 用户名和密码
- **THEN** 系统 SHALL 使用 Electron safeStorage API 加密存储凭据到本地配置文件

#### Scenario: 未配置凭据时补全

- **WHEN** 用户未配置 MusicBrainz 凭据且触发数据补全
- **THEN** 系统 SHALL 提示用户先配置 MusicBrainz 账号

### Requirement: 补全进度反馈

系统 SHALL 在批量补全时向用户展示进度信息。

#### Scenario: 批量补全进行中

- **WHEN** 有多个专辑需要补全且补全正在进行
- **THEN** 系统 SHALL 显示当前进度（如"正在补全 3/15"）

### Requirement: 请求频率控制

系统 SHALL 以不超过 5 req/s 的频率调用 MusicBrainz API，并设置自定义 User-Agent。

#### Scenario: 正常请求

- **WHEN** 系统向 MusicBrainz API 发送请求
- **THEN** 请求间隔 SHALL 不小于 200ms，User-Agent SHALL 设置为 `AlbumShelf/<version> (<contact>)`

#### Scenario: 使用 musicbrainz-api 库

- **WHEN** 系统调用 MusicBrainz API
- **THEN** 系统 SHALL 使用 `musicbrainz-api` npm 包（官方推荐的 Node.js 库）进行所有 API 交互