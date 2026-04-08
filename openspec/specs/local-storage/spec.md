## Requirements

### Requirement: SQLite 数据库初始化

系统 SHALL 在首次启动时自动创建 SQLite 数据库文件，并初始化所有表结构。

#### Scenario: 首次启动

- **WHEN** 应用首次启动且数据库文件不存在
- **THEN** 系统 SHALL 在用户应用数据目录下创建 SQLite 数据库文件，并执行建表语句创建 Album、Track、Genre、album_genre 表

#### Scenario: 后续启动

- **WHEN** 应用启动且数据库文件已存在
- **THEN** 系统 SHALL 直接连接已有数据库，不重复建表

### Requirement: Album 表结构

系统 SHALL 维护 Album 表，存储专辑的核心信息。

#### Scenario: Album 表字段

- **WHEN** Album 表被创建
- **THEN** 表 SHALL 包含以下字段：id（主键，自增）、netease_id（网易云专辑ID，唯一）、musicbrainz_id（MusicBrainz Release Group ID，可空）、title（专辑名）、artist（艺术家名）、cover_url（封面URL，可空）、release_date（发行日期，可空）、mb_rating（MusicBrainz 评分，可空）、mb_rating_count（评分人数，可空）、user_rating（用户个人评分，REAL 类型，可空，范围 0.5~5.0 步长 0.5）、track_count（曲目数，可空）、synced_at（同步时间）、enriched_at（补全时间，可空）、created_at（创建时间）

### Requirement: Track 表结构

系统 SHALL 维护 Track 表，存储曲目信息并关联到专辑。

#### Scenario: Track 表字段

- **WHEN** Track 表被创建
- **THEN** 表 SHALL 包含以下字段：id（主键，自增）、album_id（外键关联 Album.id）、netease_id（网易云曲目ID，可空）、title（曲目名）、artist（艺术家名，可空）、track_number（曲目编号）、disc_number（碟片编号，默认1）、duration_ms（时长毫秒，可空）、created_at（创建时间）

### Requirement: Genre 表与多对多关联

系统 SHALL 维护 Genre 表和 album_genre 关联表，实现专辑与风格标签的多对多关系。

#### Scenario: Genre 表字段

- **WHEN** Genre 表被创建
- **THEN** 表 SHALL 包含以下字段：id（主键，自增）、name（风格名称，唯一）

#### Scenario: album_genre 关联

- **WHEN** album_genre 关联表被创建
- **THEN** 表 SHALL 包含 album_id（外键关联 Album.id）和 genre_id（外键关联 Genre.id），联合唯一约束

### Requirement: 数据库存储位置

系统 SHALL 将 SQLite 数据库文件存储在 Electron 的用户应用数据目录下。

#### Scenario: 存储路径

- **WHEN** 系统初始化数据库
- **THEN** 数据库文件 SHALL 位于 `app.getPath('userData')` 下，文件名为 `album-shelf.db`