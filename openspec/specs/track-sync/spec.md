## ADDED Requirements

### Requirement: 从网易云获取专辑曲目并同步到本地

系统 SHALL 提供通过 ncm-cli 获取指定专辑的曲目列表并写入 track 表的能力。

#### Scenario: 成功同步曲目

- **WHEN** 调用曲目同步方法，传入专辑的内部 ID 和 `netease_album_id`（加密 ID）
- **THEN** 系统 SHALL 调用 `ncm-cli album tracks --albumId <加密ID>` 获取曲目列表，将返回的每首曲目映射为 track 表记录（`netease_song_id` ← `id`，`netease_original_id` ← `originalId`，`title` ← `name`，`duration_ms` ← `duration`，`artist` ← artists 数组的 name 用 " / " 连接，`track_number` ← 数组索引 + 1，`disc_number` ← 1），先删除该专辑已有曲目再批量插入

#### Scenario: 同步后更新 album 的 track_count

- **WHEN** 曲目同步成功
- **THEN** 系统 SHALL 将 album 表的 `track_count` 更新为实际获取到的曲目数量

#### Scenario: ncm-cli 调用失败

- **WHEN** ncm-cli 调用返回错误（如专辑 ID 无效、网络异常、未登录）
- **THEN** 系统 SHALL 不修改 track 表已有数据，并将错误向上层传播