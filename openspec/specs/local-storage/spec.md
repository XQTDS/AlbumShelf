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
- **THEN** 表 SHALL 包含以下字段：id（主键，自增）、netease_album_id（网易云加密专辑ID，唯一）、netease_original_id（网易云原始专辑ID，可空）、musicbrainz_id（MusicBrainz Release Group ID，可空）、title（专辑名）、artist（艺术家名，派生展示文本，多艺术家以 ' / ' 连接）、artists（结构化艺术家 JSON [{name, originalId, id}]，真源，可空；NULL = 未回填）、cover_url（封面URL，可空）、release_date（发行日期，可空）、mb_rating（MusicBrainz 评分，可空）、mb_rating_count（评分人数，可空）、user_rating（用户个人评分，REAL 类型，可空，范围 0.5~5.0 步长 0.5）、physical_media（实体介质标记，TEXT 类型，可空，逗号分隔的 vinyl/cd/cassette 枚举组合）、track_count（曲目数，可空）、synced_at（同步时间）、enriched_at（补全时间，可空）、created_at（创建时间）

#### Scenario: user_rating 字段迁移

- **WHEN** 应用启动且 album 表尚无 user_rating 列
- **THEN** 系统 SHALL 通过 ALTER TABLE 添加 `user_rating REAL` 列，默认值为 NULL

#### Scenario: physical_media 字段迁移

- **WHEN** 应用启动且 album 表尚无 physical_media 列
- **THEN** 系统 SHALL 通过 ALTER TABLE 添加 `physical_media TEXT` 列，默认值为 NULL

#### Scenario: artists 字段迁移

- **WHEN** 应用启动且 album 表尚无 artists 列
- **THEN** 系统 SHALL 通过 ALTER TABLE 添加 `artists TEXT` 列（JSON 数组 `[{name, originalId, id}]`），默认值为 NULL（NULL = 未回填）
- **AND** artist 文本列 SHALL 保留为其派生展示文本（多艺术家以 ' / ' 连接），继续服务于搜索与补全

#### Scenario: artist_ids 冗余列移除

- **WHEN** 应用启动且 album 表仍存在 artist_ids 列（历史开发版遗留，从未随版本发布）
- **THEN** 系统 SHALL 尝试 ALTER TABLE DROP COLUMN artist_ids
- **AND** 删除失败时 SHALL 仅记录警告并继续启动（列保留无害）

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

### Requirement: followed_artist 表结构

系统 SHALL 维护 followed_artist 表，存储用户关注的艺术家（关注粒度 = 拆分后的单个艺术家名）。

#### Scenario: followed_artist 表字段

- **WHEN** followed_artist 表被创建
- **THEN** 表 SHALL 包含以下字段：id（主键，自增）、name（艺术家名，唯一）、original_id（网易云明文艺术家 ID，可空）、encrypted_id（网易云加密艺术家 ID，可空）、followed_at（关注时间，默认 UTC 当前时间）

#### Scenario: last_checked_at 字段迁移

- **WHEN** 应用启动且 followed_artist 表缺少 last_checked_at 列
- **THEN** 系统 SHALL 通过守卫式 ALTER 添加该列（TEXT，可空），NULL 表示该艺术家从未执行过新专辑检查

#### Scenario: 导出导入包含关注数据

- **WHEN** 用户导出数据
- **THEN** 导出 JSON SHALL 为 version 2 格式，包含 followedArtists 数组（完整字段）
- **WHEN** 导入 v2 数据
- **THEN** 系统 SHALL 按 name 去重 upsert 关注记录，已存在记录 SHALL 仅补缺失的 ID 字段，并在导入结果中返回导入的关注数
- **WHEN** 导入 v1 数据（无 followedArtists 字段）
- **THEN** 系统 SHALL 按空数组处理，导入 SHALL 正常完成

### Requirement: artist_update 表结构

系统 SHALL 维护 artist_update 表，存储关注艺术家的新专辑动态条目。该表 SHALL 独立于 album 表——手动同步会删除不在网易云收藏列表中的本地专辑，动态条目若写入 album 会被同步整片删除。

#### Scenario: artist_update 表字段

- **WHEN** artist_update 表被创建
- **THEN** 表 SHALL 包含以下字段：id（主键，自增）、artist_name（关注粒度，对齐 followed_artist.name）、album_id（加密专辑 ID，与 album.netease_album_id 同域）、original_id（明文专辑 ID，可空，供网易云跳转）、title、publish_time（原始毫秒时间戳，可空）、release_date（按北京时间换算，可空）、cover_url（远程直链，可空）、category（own / participation）、track_count（可空）、duration_ms（可空）、found_at（默认 UTC 当前时间）、seen_at（可空，NULL = 未读）
- **AND** 表 SHALL 建立唯一约束 `UNIQUE(artist_name, album_id)`
- **AND** 表 SHALL 建立索引 `idx_artist_update_seen(seen_at)` 与 `idx_artist_update_found(found_at DESC)`

#### Scenario: track_count / duration_ms 字段迁移

- **WHEN** 应用启动且 artist_update 表缺少 track_count 或 duration_ms 列
- **THEN** 系统 SHALL 通过守卫式 ALTER 添加缺失列（INTEGER，可空），已有行保持 NULL 并由后续检查的自愈路径补齐

#### Scenario: 不进入导出导入

- **WHEN** 用户导出数据
- **THEN** 导出 JSON SHALL NOT 包含 artist_update 数据（动态条目为可重新拉取的派生数据，不纳入版本化导出）

#### Scenario: 未入库条目的封面不落本地缓存

- **WHEN** 动态条目对应的专辑尚未进入 album 表
- **THEN** 其封面 SHALL 使用远程 https 直链渲染，SHALL NOT 写入 `cover://` 本地缓存（缓存强依赖 album 行的数字 id）

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