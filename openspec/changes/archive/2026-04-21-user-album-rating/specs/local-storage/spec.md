## MODIFIED Requirements

### Requirement: Album 表结构

系统 SHALL 维护 Album 表，存储专辑的核心信息。

#### Scenario: Album 表字段

- **WHEN** Album 表被创建
- **THEN** 表 SHALL 包含以下字段：id（主键，自增）、netease_id（网易云专辑ID，唯一）、musicbrainz_id（MusicBrainz Release Group ID，可空）、title（专辑名）、artist（艺术家名）、cover_url（封面URL，可空）、release_date（发行日期，可空）、mb_rating（MusicBrainz 评分，可空）、mb_rating_count（评分人数，可空）、user_rating（用户个人评分，REAL 类型，可空，范围 0.5~5.0 步长 0.5）、track_count（曲目数，可空）、synced_at（同步时间）、enriched_at（补全时间，可空）、created_at（创建时间）

#### Scenario: user_rating 字段迁移

- **WHEN** 应用启动且 album 表尚无 user_rating 列
- **THEN** 系统 SHALL 通过 ALTER TABLE 添加 `user_rating REAL` 列，默认值为 NULL
