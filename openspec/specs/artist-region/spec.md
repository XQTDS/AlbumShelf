## Requirements

### Requirement: Artist 表结构

系统 SHALL 维护 `artist` 表，按 MusicBrainz Artist MBID 唯一标识艺人，并存储其来源地区信息。地区信息 SHALL 以艺人为粒度存储，专辑 SHALL NOT 冗余存储地区值。

#### Scenario: Artist 表字段

- **WHEN** `artist` 表被创建
- **THEN** 表 SHALL 包含以下字段：id（主键，自增）、musicbrainz_artist_id（MusicBrainz Artist MBID，非空且唯一）、name（MB 艺人规范名）、sort_name（MB 排序名，可空）、country（MB 原始 country，ISO 3166-1 alpha-2，可空）、area（MB area 名称，可空）、region（归一化地区键，可空）、region_fetched_at（地区已尝试解析时间，可空）、created_at（创建时间）、updated_at（更新时间，可空）
- **AND** 表 SHALL 建立在 `region` 列上的索引 `idx_artist_region`

#### Scenario: 以 MBID 去重

- **WHEN** 同一 MB 艺人被多张专辑引用
- **THEN** 系统 SHALL 按 `musicbrainz_artist_id` 复用同一行，SHALL NOT 按艺人名新建重复行
- **AND** 同名不同艺人（实测 MB 中「王菲」有 HK 与 TW 两个结果）SHALL 因 MBID 不同而保持为两行

#### Scenario: 地区字段语义

- **WHEN** MusicBrainz 返回某艺人的 `country` 与 `area`
- **THEN** `country` SHALL 原样保存 MB 的 ISO 代码，`area` SHALL 保存 MB area 名称，`region` SHALL 保存归一化后的地区键
- **AND** `region_fetched_at` SHALL 在每次成功完成地区解析尝试时写入，包括「MB 确实没有地区数据」的情况，以避免重复查询

### Requirement: 专辑与主艺人关联

系统 SHALL 在 `album` 表中保存主艺人的 MusicBrainz Artist MBID（`primary_artist_mbid`），专辑地区 SHALL 通过该引用 JOIN `artist` 表得到。

#### Scenario: Album 表新增字段

- **WHEN** 应用启动且 album 表尚无 `primary_artist_mbid` 列
- **THEN** 系统 SHALL 通过 `ALTER TABLE` 添加 `primary_artist_mbid TEXT` 列，并以 `REFERENCES artist(musicbrainz_artist_id)` 声明逻辑外键
- **WHEN** 应用启动且 album 表尚无 `region_checked_at` 列
- **THEN** 系统 SHALL 通过 `ALTER TABLE` 添加 `region_checked_at TEXT` 列
- **AND** 系统 SHALL 建立 `idx_album_primary_artist_mbid` 索引

#### Scenario: 主艺人定义

- **WHEN** MusicBrainz release-group 返回多个 `artist-credit`
- **THEN** 系统 SHALL 取第一个 credit 的 artist（`artist-credit[0]`）作为主艺人
- **AND** 其他参与艺人 SHALL NOT 参与地区判定

#### Scenario: 专辑地区查询

- **WHEN** 系统返回专辑数据
- **THEN** 地区字段 SHALL 通过 `LEFT JOIN artist ON artist.musicbrainz_artist_id = album.primary_artist_mbid` 派生
- **AND** 返回结果 SHALL 包含地区键 `region`、MB area 名称 `region_area` 与中文展示名 `region_label`

#### Scenario: 无 MB 匹配的专辑

- **WHEN** 专辑没有 `musicbrainz_id` 或没有主艺人引用
- **THEN** 其地区 SHALL 为空，展示为「—」，SHALL NOT 根据网易云字段或艺人名猜测地区

### Requirement: 地区归一化

系统 SHALL 将 MusicBrainz 的 `country` / `area` 归一化为大写 ISO 3166-1 alpha-2 地区键。

#### Scenario: country 优先

- **WHEN** MB artist 返回合法的两位 `country` 代码
- **THEN** 系统 SHALL 直接使用该代码（大写）作为地区键

#### Scenario: area ISO 兜底

- **WHEN** `country` 缺失且 `area` 带 `iso-3166-1-codes`
- **THEN** 系统 SHALL 取其中第一个合法的两位代码作为地区键

#### Scenario: area 名称/城市映射

- **WHEN** `country` 与 area ISO 均缺失，但 area 名称命中已知国家/地区或城市
- **THEN** 系统 SHALL 映射为对应地区键（如 Taipei→TW、Hong Kong→HK、Beijing→CN）

#### Scenario: 无法识别不猜测

- **WHEN** `country`、area ISO 与 area 名称均无法识别
- **THEN** 地区键 SHALL 为 NULL，专辑展示「—」，SHALL NOT 使用默认值或按名称模糊推断

#### Scenario: 地区中文展示名

- **WHEN** 地区键为 CN / TW / HK / MO
- **THEN** 展示名 SHALL 分别为「中国大陆」「中国台湾」「中国香港」「中国澳门」
- **WHEN** 地区键为其他合法 ISO 代码
- **THEN** 系统 SHALL 使用 `Intl.DisplayNames('zh-CN')` 生成中文名，失败时回退原始代码

### Requirement: 新专辑地区自动补全

系统 SHALL 在数据补全匹配专辑时顺带解析主艺人地区，SHALL NOT 为此额外发起 release-group 请求。

#### Scenario: 精确匹配时写入

- **WHEN** 数据补全精确匹配成功并 lookup release-group（include 含 `artist-credits`）
- **THEN** 系统 SHALL 从 `artist-credit[0].artist` 读取 MBID、名称、country / area
- **AND** 若 artist 表尚无该 MBID 的有效地区结果，系统 SHALL upsert artist 行
- **AND** 系统 SHALL 写入专辑的 `primary_artist_mbid` 与 `region_checked_at`

#### Scenario: country 缺失时补 artist lookup

- **WHEN** release-group 的 artist-credit 未返回 `country`，且本地 artist 表没有该 MBID 的有效地区结果
- **THEN** 系统 SHALL 发起一次 `lookup('artist', mbid)` 获取 `country` / `area`
- **AND** 同一 MBID 的结果 SHALL 在服务生命周期内缓存，SHALL NOT 对同一艺人重复查询

#### Scenario: 地区解析失败不影响专辑匹配

- **WHEN** artist lookup 因网络/API 错误失败
- **THEN** 系统 SHALL 仍写入专辑的 MB 匹配、评分、风格与外部链接
- **AND** SHALL NOT 写入新的 `primary_artist_mbid`（保留旧值供界面暂时展示）
- **AND** SHALL 将 `region_checked_at` 置为 NULL，标记本次地区解析未成功，后续重新补全/重新同步可再次尝试
- **AND** 若不置 NULL，重匹配后旧水位线会让该专辑永远不再重试，导致主艺人与地区永久不一致

#### Scenario: 无 artist-credit

- **WHEN** release-group lookup 成功但不含 `artist-credit`
- **THEN** 系统 SHALL 写入 `region_checked_at` 表示已尝试，并保持 `primary_artist_mbid` 为 NULL，避免反复查询

#### Scenario: 模糊匹配确认

- **WHEN** 用户确认模糊匹配候选并完成 release-group lookup
- **THEN** 系统 SHALL 按同样的规则解析主艺人地区并写入

### Requirement: 地区数据导出导入

系统 SHALL 将 artist 表与专辑主艺人引用纳入数据导出/导入。

#### Scenario: 导出版本升级

- **WHEN** 用户导出数据
- **THEN** 导出 JSON SHALL 为 version 3 格式，包含 `artists` 数组（完整 artist 表字段）
- **AND** album 导出 SHALL 包含 `primary_artist_mbid` 与 `region_checked_at`（`SELECT *` 全列导出）

#### Scenario: 导入 artist

- **WHEN** 导入 version 3 数据
- **THEN** 系统 SHALL 先按 `musicbrainz_artist_id` upsert artist 行：非空新值覆盖旧值，空新值保留旧值
- **AND** 再导入 album，并在 UPDATE / INSERT 列清单中包含 `primary_artist_mbid` 与 `region_checked_at`

#### Scenario: 导入旧版数据

- **WHEN** 导入 version 1 / 2 数据
- **THEN** `artists` SHALL 按空数组处理
- **AND** 对已存在专辑，UPDATE SHALL 用 `COALESCE` 保留库中已有的 `primary_artist_mbid` / `region_checked_at`（旧版文件不含这两列，不应抹掉已有地区关联）
- **AND** 对新专辑，两个新列 SHALL 按 NULL 落库
- **AND** 导入后新专辑地区为空；若其已有 MB 匹配，需通过「重新补全所有专辑」或单张重新同步触发地区解析

#### Scenario: artist_update 不导出

- **WHEN** 用户导出数据
- **THEN** 导出 JSON SHALL NOT 包含 `artist_update` 表（派生数据，可重新拉取）

### Requirement: 补全重置语义

系统 SHALL 在重置补全状态时保留艺人地区缓存，避免无谓丢失。

#### Scenario: 重新补全全部

- **WHEN** 用户触发「重新补全所有专辑」
- **THEN** 系统 SHALL 清空专辑的 `enriched_at` / `musicbrainz_id` / `mb_rating` / `mb_rating_count`
- **AND** SHALL NOT 清空 `artist` 表、专辑的 `primary_artist_mbid` 与 `region_checked_at`
- **AND** 后续补全成功时 SHALL 用新的匹配结果覆盖专辑的主艺人引用
- **AND** 后续补全成功但地区解析失败时 SHALL 按「地区解析失败不影响专辑匹配」清空 `region_checked_at`，以便后续重新补全重试

#### Scenario: 单张专辑重新同步

- **WHEN** 用户对单张专辑执行重新同步
- **THEN** SHALL 按上一场景的同一语义保留艺人地区数据

#### Scenario: 地区补全实现不依赖网易云字段

- **WHEN** 系统判定专辑地区
- **THEN** SHALL NOT 使用网易云 `language` / `company` / `genre` / `nationality` 字段
- **AND** 地区唯一来源 SHALL 为 MusicBrainz artist 的 country / area
