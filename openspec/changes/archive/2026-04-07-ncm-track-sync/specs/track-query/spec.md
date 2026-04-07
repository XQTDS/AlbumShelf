## ADDED Requirements

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