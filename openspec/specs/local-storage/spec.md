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
- **THEN** 表 SHALL 包含以下字段：id（主键，自增）、netease_album_id（网易云加密专辑ID，唯一）、netease_original_id（网易云原始专辑ID，可空）、musicbrainz_id（MusicBrainz Release Group ID，可空）、title（专辑名）、artist（艺术家名）、cover_url（封面URL，可空）、release_date（发行日期，可空）、mb_rating（MusicBrainz 评分，可空）、mb_rating_count（评分人数，可空）、user_rating（用户个人评分，REAL 类型，可空，范围 0.5~5.0 步长 0.5）、track_count（曲目数，可空）、synced_at（同步时间）、enriched_at（补全时间，可空）、created_at（创建时间）

#### Scenario: user_rating 字段迁移

- **WHEN** 应用启动且 album 表尚无 user_rating 列
- **THEN** 系统 SHALL 通过 ALTER TABLE 添加 `user_rating REAL` 列，默认值为 NULL

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

### Requirement: 封面图片本地缓存

系统 SHALL 将专辑封面图片下载并缓存到本地磁盘，渲染层通过 `cover://` 自定义协议加载，实现离线可用的封面显示。

#### Scenario: 缓存存储位置与命名

- **WHEN** 系统缓存一张封面图片
- **THEN** 图片文件 SHALL 位于 `app.getPath('userData')/covers/` 目录下，文件名为 `<albumId>_<cover_url 的 SHA-1 前 12 位>.<jpg|jpeg|png|webp|gif>`

#### Scenario: 缓存未命中时懒下载

- **WHEN** 渲染层请求 `cover://album/<albumId>` 且对应缓存文件不存在
- **THEN** 系统 SHALL 从数据库中该专辑的 `cover_url` 下载图片（15 秒超时），写入缓存目录后返回该图片
- **AND** 下载失败或专辑/URL 不存在时 SHALL 返回 404

#### Scenario: 缓存命中

- **WHEN** 渲染层请求 `cover://album/<albumId>` 且对应缓存文件存在
- **THEN** 系统 SHALL 直接返回本地缓存文件，不发起网络请求

#### Scenario: 封面 URL 变更后缓存失效

- **WHEN** 专辑的 `cover_url` 更新为新值
- **THEN** 新 URL 生成的缓存路径与旧文件不同，下次请求将下载新封面
- **AND** 写入新缓存文件后 SHALL 删除该专辑的旧缓存文件

#### Scenario: 渲染层回退链

- **WHEN** `cover://` 协议加载失败
- **THEN** 渲染层 SHALL 回退为直接加载远程 `cover_url`
- **AND** 远程 URL 也失败时 SHALL 显示占位符并触发现有封面补全流程

#### Scenario: 并发去重

- **WHEN** 同一专辑的多个图片请求同时到达且缓存未命中
- **THEN** 系统 SHALL 仅发起一次下载，其余请求共享同一结果