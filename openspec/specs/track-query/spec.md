## ADDED Requirements

### Requirement: 按专辑 ID 查询曲目列表

系统 SHALL 提供按专辑 ID 查询该专辑所有曲目的能力，返回按 `disc_number` 升序、`track_number` 升序排列的曲目列表。

#### Scenario: 查询有曲目的专辑

- **WHEN** 前端通过 `track:listByAlbum` IPC 接口传入一个有效的 `albumId`
- **THEN** 系统 SHALL 返回该专辑的所有曲目，每个曲目包含 `id`、`title`、`artist`、`track_number`、`disc_number`、`duration_ms` 字段，按 `disc_number` 升序、`track_number` 升序排列

#### Scenario: 查询无曲目的专辑

- **WHEN** 前端通过 `track:listByAlbum` IPC 接口传入一个有效的 `albumId`，但该专辑在 track 表中没有任何记录
- **THEN** 系统 SHALL 返回空数组 `[]`

#### Scenario: 返回值格式

- **WHEN** `track:listByAlbum` 调用成功
- **THEN** 返回值 SHALL 使用 `IpcResult<Track[]>` 格式包装，与现有 IPC 接口风格一致

### Requirement: 曲目批量写入

TrackService SHALL 提供批量插入曲目的方法。

#### Scenario: 批量插入曲目

- **WHEN** 调用 `insertTracks(tracks)` 传入曲目数组
- **THEN** 系统 SHALL 在事务中批量插入所有曲目到 track 表

### Requirement: 按专辑删除曲目

TrackService SHALL 提供按专辑 ID 删除所有曲目的方法。

#### Scenario: 删除指定专辑的所有曲目

- **WHEN** 调用 `deleteTracksByAlbumId(albumId)` 传入专辑 ID
- **THEN** 系统 SHALL 删除 track 表中该专辑的所有曲目记录