## ADDED Requirements

### Requirement: 获取专辑详情

系统 SHALL 通过 `ncm-cli album get --albumId <albumId>` 命令获取指定专辑的详情信息。

#### Scenario: 成功获取专辑详情

- **WHEN** 调用 `getAlbumDetail(albumId)` 且命令返回 code 200 的 JSON
- **THEN** 系统 SHALL 解析返回的 `originalId`、`id`、`name`、`artists`、`coverImgUrl`、`publishTime` 等字段

#### Scenario: 发行日期换算

- **WHEN** 将专辑详情的 publishTime 换算为发行日期
- **THEN** 系统 SHALL 按北京时间（UTC+8）取日历日期（publishTime 为北京时间零点的时间戳，直接取 UTC 日期会早一天）

#### Scenario: 专辑不存在或命令失败

- **WHEN** 命令返回非 200 或专辑不存在
- **THEN** 系统 SHALL 抛出错误，由调用方处理（回填计入失败、封面获取降级返回空）
