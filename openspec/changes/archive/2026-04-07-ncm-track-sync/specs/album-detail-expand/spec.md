## ADDED Requirements

### Requirement: 展开详情时自动补全曲目数据

#### Scenario: 本地无曲目数据时自动从远程拉取

- **WHEN** `track:listByAlbum` 被调用，该专辑的 track 表记录为空，且专辑有有效的 `netease_album_id`
- **THEN** 系统 SHALL 自动调用曲目同步服务从 ncm-cli 拉取该专辑的曲目，写入 track 表后返回结果

#### Scenario: 本地已有曲目数据

- **WHEN** `track:listByAlbum` 被调用，该专辑的 track 表已有记录
- **THEN** 系统 SHALL 直接返回本地数据，不触发远程拉取

#### Scenario: 远程拉取失败

- **WHEN** 自动拉取曲目时 ncm-cli 调用失败
- **THEN** 系统 SHALL 返回空曲目列表，前端显示"暂无曲目信息"