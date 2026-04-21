## MODIFIED Requirements

### Requirement: Album 表结构

系统 SHALL 维护 Album 表，存储专辑的核心信息。AlbumService 需支持更新 `netease_album_id` 字段。

#### Scenario: Album 表字段

- **WHEN** Album 表被创建
- **THEN** 表 SHALL 包含以下字段：id（主键，自增）、netease_album_id（网易云加密专辑ID，唯一）、netease_original_id（网易云原始专辑ID，可空）、musicbrainz_id（MusicBrainz Release Group ID，可空）、title（专辑名）、artist（艺术家名）、cover_url（封面URL，可空）、release_date（发行日期，可空）、mb_rating（MusicBrainz 评分，可空）、mb_rating_count（评分人数，可空）、user_rating（用户个人评分，REAL 类型，可空，范围 0.5~5.0 步长 0.5）、track_count（曲目数，可空）、synced_at（同步时间）、enriched_at（补全时间，可空）、created_at（创建时间）

#### Scenario: 更新 netease_album_id

- **WHEN** 调用 `updateNeteaseAlbumId(id, newNeteaseAlbumId, newOriginalId)` 方法
- **THEN** 系统 SHALL 更新指定专辑行的 `netease_album_id` 和 `netease_original_id` 字段，若新 ID 与其他专辑冲突则抛出错误
