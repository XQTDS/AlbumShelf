## Requirements

### Requirement: Artist 表结构

系统 SHALL 维护 `artist` 表，以**网易云艺人 ID**（`netease_artist_id`）为业务唯一键，并存储 MusicBrainz 来源地区。地区信息 SHALL 以艺人为粒度存储，专辑 SHALL NOT 冗余存储地区值。

#### Scenario: Artist 表字段

- **WHEN** `artist` 表被创建
- **THEN** 表 SHALL 包含以下字段：id（主键，自增）、netease_artist_id（网易云明文艺人 ID，业务唯一键，可空以兼容历史 MBID 行）、netease_encrypted_id（网易云加密艺人 ID，可空）、musicbrainz_artist_id（MusicBrainz Artist MBID，地区来源属性，可空且唯一）、name（网易云展示名）、sort_name（MB 排序名，可空）、country（MB 原始 country，ISO 3166-1 alpha-2，可空）、area（MB area 名称，可空）、region（归一化地区键，可空）、region_fetched_at（地区首次解析时间，已有值保留，可空）、created_at（创建时间）、updated_at（更新时间，可空）
- **AND** 表 SHALL 建立 `idx_artist_region` 索引与 `idx_artist_netease_id` 唯一索引

#### Scenario: 以网易云艺人 ID 去重

- **WHEN** 同一网易云艺人被多张专辑引用
- **THEN** 系统 SHALL 按 `netease_artist_id` 复用同一行，SHALL NOT 按艺人名新建重复行
- **AND** `album.artists[0].originalId` 是主艺人身份的判定依据

#### Scenario: MBID 退化为地区来源属性

- **WHEN** 同一 MBID 对应多个网易云艺人 ID
- **THEN** 系统 SHALL 选择一个网易云行持有 `musicbrainz_artist_id`，其余行复制 `country` / `area` / `region` / `region_fetched_at`，并保持 `musicbrainz_artist_id = NULL`
- **AND** 地区展示仍以网易云行自身的 `region` 为准，不要求 MBID 一一对应

#### Scenario: 地区字段语义

- **WHEN** MusicBrainz 返回某艺人的 `country` 与 `area`
- **THEN** `country` SHALL 原样保存 MB 的 ISO 代码，`area` SHALL 保存 MB area 名称，`region` SHALL 保存归一化后的地区键
- **AND** 一个网易云艺人行已有非空 `region` 时 SHALL 保留该值（first-wins），避免同一艺人在多次补全间抖动
- **AND** `region_fetched_at` SHALL 记录**首次**写入地区结果的时间（已有值保留），用作「是否已尝试解析」的标记

### Requirement: 专辑与主艺人关联

系统 SHALL 在 `album` 表中保存主艺人的网易云明文 ID（`primary_artist_id`），专辑地区 SHALL 通过该键 JOIN `artist.netease_artist_id` 得到。

#### Scenario: Album 表新增字段

- **WHEN** 应用启动且 album 表尚无 `primary_artist_id` 列
- **THEN** 系统 SHALL 通过 `ALTER TABLE` 添加 `primary_artist_id INTEGER` 列
- **AND** 系统 SHALL 建立 `idx_album_primary_artist_id` 索引
- **AND** 历史列 `primary_artist_mbid` SHALL 保留但不再作为查询依据

#### Scenario: 主艺人定义

- **WHEN** 专辑入库或迁移
- **THEN** `primary_artist_id` SHALL 取自 `album.artists[0].originalId`（网易云主艺人）
- **WHEN** MusicBrainz release-group 返回多个 `artist-credit`
- **THEN** 地区来源 SHALL 取第一个 credit 的 artist（`artist-credit[0]`）
- **AND** 其他参与艺人 SHALL NOT 参与地区判定
- **AND** 地区按网易云艺人 ID 共享，因此 `artist-credit[0]` 必须能与网易云主艺人确认为同一实体（名称/别名完全相同；或含拉丁的中英混排名存在包含关系；或同长度 CJK 名（≥3 字）字符重合率 ≥ 60%）
- **AND** 无法确认同一实体，或任一方为群星/Various Artists 等合成实体时，SHALL NOT 把该 MB 的 `country` / `area` / `region` 写入共享 artist 行；该专辑的地区留空

#### Scenario: 专辑地区查询

- **WHEN** 系统返回专辑数据
- **THEN** 地区字段 SHALL 通过 `LEFT JOIN artist ON artist.netease_artist_id = album.primary_artist_id` 派生
- **AND** 返回结果 SHALL 包含地区键 `region`、MB area 名称 `region_area` 与中文展示名 `region_label`

#### Scenario: 无 MB 匹配的专辑

- **WHEN** 专辑没有 `musicbrainz_id`，但其 `artists[0].originalId` 对应的 artist 行已有地区
- **THEN** 专辑 SHALL 通过网易云艺人键正常显示地区
- **WHEN** 对应 artist 行不存在或地区为空
- **THEN** 专辑地区 SHALL 为空，展示为「—」，SHALL NOT 根据艺人名猜测地区

#### Scenario: 无结构化艺人

- **WHEN** 专辑的 `artists` 为 NULL、JSON 损坏、数组为空或主艺人缺少 `originalId`
- **THEN** `primary_artist_id` SHALL 为 NULL，地区为空

### Requirement: 网易云艺人身份迁移

系统 SHALL 在启动时幂等执行迁移，把存量 artist 行与专辑关联到网易云艺人 ID。

#### Scenario: 按网易云 ID 分组

- **WHEN** 迁移扫描专辑
- **THEN** 系统 SHALL 解析 `album.artists[0]` 的 `originalId`、加密 ID 与名称，按 `originalId` 分组
- **AND** 没有结构化主艺人 ID 的专辑 SHALL 跳过

#### Scenario: 选择主 MBID

- **WHEN** 一个网易云艺人分组内存在多个候选 MBID
- **THEN** 系统 SHALL 先过滤出能与网易云主艺人确认为同一实体的候选（名称/别名/CJK 相似性）
- **AND** 无任何候选可确认时，SHALL NOT 为该网易云行写入 MBID/地区（宁可留空，不挂错实体）
- **AND** 在可确认候选中，优先选择 artist 表中有非空 `region` 的候选
- **AND** 其次选择组内专辑数最多的候选
- **AND** 并列时按 MBID 字典序选择

#### Scenario: 复用历史 MBID 行

- **WHEN** 选中的 MBID 行尚无 `netease_artist_id`，且当前网易云行尚不存在
- **THEN** 系统 SHALL 直接把网易云 ID、加密 ID 与名称挂到该行，SHALL NOT 新建重复行
- **WHEN** 当前网易云行已存在但尚无 MBID，且选中的 MBID 行尚未绑定网易云 ID
- **THEN** 系统 SHALL 先把网易云行的缺失字段合并进 MB 行，再删除网易云行并把网易云 ID 挂到 MB 行，保证同一 MBID 只落在一行
- **WHEN** 该 MBID 已被另一个网易云行占用
- **THEN** 系统 SHALL 把地区字段复制到当前网易云行，并保持当前行 `musicbrainz_artist_id = NULL`

#### Scenario: 确保网易云行存在

- **WHEN** 某网易云主艺人 ID 在 artist 表中没有对应行
- **THEN** 系统 SHALL 新建一行（地区为空，等待后续补全）
- **AND** 后续该艺人的专辑补全成功时 SHALL 填充地区字段

#### Scenario: 回填专辑关联

- **WHEN** 迁移完成 artist 行处理后
- **THEN** 系统 SHALL 把所有有结构化主艺人 ID 的专辑的 `primary_artist_id` 回填为该网易云 ID
- **AND** 迁移 SHALL 幂等：已存在的行/值不重复写，无变化时零写入

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
- **AND** 写入共享 artist 行前 SHALL 校验 MB credit 与网易云主艺人可确认为同一实体；无法确认或为合成实体时 SHALL NOT 写入 MBID/地区
- **AND** 可确认时按专辑的网易云主艺人 ID upsert artist 行：已有地区保留，缺失地区填充
- **AND** 系统 SHALL 写入专辑的 `primary_artist_id` 与 `region_checked_at`

#### Scenario: country 缺失时补 artist lookup

- **WHEN** release-group 的 artist-credit 未返回 `country`，且本地 artist 表没有该 MBID 的有效地区结果
- **THEN** 系统 SHALL 发起一次 `lookup('artist', mbid)` 获取 `country` / `area`
- **AND** 同一 MBID 的结果 SHALL 在服务生命周期内缓存，SHALL NOT 对同一艺人重复查询

#### Scenario: 地区解析失败不影响专辑匹配

- **WHEN** artist lookup 因网络/API 错误失败
- **THEN** 系统 SHALL 仍写入专辑的 MB 匹配、评分、风格与外部链接
- **AND** SHALL 将 `region_checked_at` 置为 NULL，标记本次地区解析未成功，后续重新补全/重新同步可再次尝试
- **AND** SHALL NOT 删除已有 artist 行的地区（界面暂时沿用旧值）

#### Scenario: 无 artist-credit

- **WHEN** release-group lookup 成功但不含 `artist-credit`
- **THEN** 系统 SHALL 写入 `primary_artist_id` 与 `region_checked_at`，保持 artist 行已有地区不变，避免反复查询

#### Scenario: 无结构化网易云主艺人

- **WHEN** 专辑没有 `artists[0].originalId`
- **THEN** 系统 SHALL 只写 `region_checked_at`，SHALL NOT 创建网易云 artist 行

#### Scenario: 模糊匹配确认

- **WHEN** 用户确认模糊匹配候选并完成 release-group lookup
- **THEN** 系统 SHALL 按同样的规则解析主艺人地区并写入

### Requirement: 地区数据导出导入

系统 SHALL 将 artist 表与专辑主艺人引用纳入数据导出/导入。

#### Scenario: 导出版本升级

- **WHEN** 用户导出数据
- **THEN** 导出 JSON SHALL 为 version 4 格式，包含 `artists` 数组（含 `netease_artist_id` / `netease_encrypted_id` / `musicbrainz_artist_id` / 地区字段）
- **AND** album 导出 SHALL 包含 `primary_artist_id`、`primary_artist_mbid`（历史）与 `region_checked_at`（`SELECT *` 全列导出）

#### Scenario: 导入 v4 artist

- **WHEN** 导入 version 4 数据且 artist 行有 `netease_artist_id`
- **THEN** 系统 SHALL 按网易云艺人 ID upsert：`musicbrainz_artist_id` 仅在目标行为空时填充，已有 MBID 不被覆盖
- **AND** 地区/名称等字段按非空值填充，已有值保留
- **AND** 若入站 MBID 已被另一个网易云行占用，SHALL 保留网易云键与地区、放弃本行 MBID，不中断导入
- **AND** 只有 MBID UNIQUE 冲突才降级为「不写 MBID」，其他错误（如外键）SHALL 抛出

#### Scenario: 导入 v3 及更早数据

- **WHEN** 导入 version 1 / 2 / 3 数据
- **THEN** artist 行无网易云 ID 时 SHALL 按 `musicbrainz_artist_id` upsert
- **AND** album 的 `primary_artist_id` SHALL 用 `COALESCE` 保留库中已有值
- **AND** album 的历史列 `primary_artist_mbid` SHALL 只写目标库 artist 表中确实存在的 MBID：v4 按 `primary_artist_id` 查目标 artist 的当前 MBID；v1/v2/v3 退回文件中的 `primary_artist_mbid`，但仅当该 MBID 已在目标 artist 表存在（v3 artist 行先按 MBID 导入）时使用；否则写 NULL
- **AND** 这样 v3 备份导入空库后，启动迁移仍能从 `album.primary_artist_mbid` 收集候选并把网易云 ID 挂回带地区的 MB 行
- **AND** 导入完成后 SHALL 执行一次网易云艺人身份迁移，用导入专辑的 `artists` 把 MBID 行关联到网易云 ID

#### Scenario: 旧版导出缺少新列

- **WHEN** 导入的 album 元素没有 `primary_artist_id` / `region_checked_at`
- **THEN** 已存在专辑的对应列 SHALL 保留库中已有值（`COALESCE`）
- **AND** 新专辑按 NULL 落库，由迁移按 `artists` 回填 `primary_artist_id`

#### Scenario: artist_update 不导出

- **WHEN** 用户导出数据
- **THEN** 导出 JSON SHALL NOT 包含 `artist_update` 表（派生数据，可重新拉取）

### Requirement: 补全重置语义

系统 SHALL 在重置补全状态时保留艺人地区缓存，避免无谓丢失。

#### Scenario: 重新补全全部

- **WHEN** 用户触发「重新补全所有专辑」
- **THEN** 系统 SHALL 清空专辑的 `enriched_at` / `musicbrainz_id` / `mb_rating` / `mb_rating_count`
- **AND** SHALL NOT 清空 `artist` 表、专辑的 `primary_artist_id` 与 `region_checked_at`
- **AND** 后续补全成功时 SHALL 按网易云艺人 ID 更新地区（已有地区 first-wins）
- **AND** 后续补全成功但地区解析失败时 SHALL 清空 `region_checked_at`，以便后续重新补全重试

#### Scenario: 单张专辑重新同步

- **WHEN** 用户对单张专辑执行重新同步
- **THEN** SHALL 按上一场景的同一语义保留艺人地区数据

#### Scenario: 地区补全实现不依赖网易云字段

- **WHEN** 系统判定专辑地区
- **THEN** SHALL NOT 使用网易云 `language` / `company` / `genre` / `nationality` 字段
- **AND** 地区唯一来源 SHALL 为 MusicBrainz artist 的 country / area
