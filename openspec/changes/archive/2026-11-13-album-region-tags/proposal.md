# 专辑地区标签（基于 MusicBrainz 艺人地区）

## 背景

用户希望给专辑加上来源地区标签，例如大陆、台湾、香港艺人的专辑分别标注地区，便于浏览和筛选。

调研结论（详见 design.md）：

- **网易云侧无可用地区字段**。`album get` 只返回 `language`（如「国语,粤语」「纯音乐」），实测大陆/台湾/香港样本无地区差异；`ncm-cli` 的 artist 族只有 `songs`，公开艺人接口无 `area/country`，`search all` 的 `nationality` 恒为 `null`。`language/company/genre` 目前也未落库。
- **MusicBrainz 艺人实体提供 `country`（ISO 3166-1）与 `area`**。实测：万能青年旅店 CN、崔健 CN、王菲 HK、陈奕迅 HK、五月天 TW、S.H.E TW。现有补全流程只查 release-group，未查 artist；把 release-group lookup 的 include 加上 `artist-credits` 即可零额外请求拿到 `country`，缺失时再补一次 artist lookup。
- **覆盖率**：本机库 2621 张专辑中 2196 张（83.8%）已有 MB 匹配；随机抽取 60 张「艺术家名含 CJK 且已有 MB ID」的专辑，56 张（93.3%）能解析出 `country/area`，4 张独立艺人缺失。
- **外部站点不可靠**：RYM 403 Cloudflare、Last.fm 返回 Client Challenge、AllMusic 间歇 403 且给出生地、Discogs 无结构化国家字段。不作为本变更的数据源。

用户已确认的产品口径：

1. **细分地区**：大陆、台湾、香港、澳门分别显示，不合并为 China。
2. **以 MB 数据为准**：不引入手动编辑或外部站点推断。
3. **取主艺人**：多艺人专辑只取主艺人。
4. **地区挂在 Artist 上**：数据库新增艺人表存放地区，专辑通过主艺人引用检索地区，不在专辑行重复存储地区值。

## 目标

- 新增 `artist` 表，按 MusicBrainz Artist MBID 唯一标识艺人，存储 `country` / `area` / 归一化 `region`。
- 专辑表新增 `primary_artist_mbid`（主艺人引用）与 `region_checked_at`（地区补全水位线）；专辑的地区通过 `LEFT JOIN artist` 派生，不冗余存储。
- 数据补全（精确匹配、模糊确认）在原有 release-group lookup 上顺带解析主艺人地区，新专辑自动获得地区。
- 存量专辑通过一次性批量回填补齐地区（用户已执行完成；按用户要求，回填入口随后移除，后续新专辑随补全自动写入）。
- 表格视图在艺术家单元格内展示地区标签；详情面板展示「地区」元数据；工具栏新增地区筛选。
- 导出/导入格式升级到 version 3，包含 `artist` 表与专辑的两个新列；旧版导出仍可导入。

## 非目标

- **不做手动地区编辑**：用户已确认以 MB 数据为准；MB 缺失时留空，不猜测。
- **不做多艺人/合作专辑的多值地区**：第一版只取 MB release-group 的主艺人（`artist-credit[0]`）。
- **不在唱片墙卡片上展示地区角标**：与现有风格标签一致，地区只出现在表格与详情面板。
- **不抓取 RYM / Discogs / AllMusic / Last.fm / Wikipedia**：外部站点不作为地区来源。
- **不做地区统计弹窗**、不做按地区排序、不做地区库管理界面。
- **不自动刷新 MB 社区后续修改**：`region_checked_at` 为「已尝试」水位线，不设过期时间；需要时可另开变更做强制刷新。
- **不改变网易云同步行为**：`language/company/genre` 仍不落库、不参与地区判定。

## 方案概述

详见 design.md。核心决策：

- **艺人是地区的主体**：`artist` 表以 `musicbrainz_artist_id` 为唯一键；专辑只存 `primary_artist_mbid`，地区由 join 得到。
- **数据来源**：补全路径的 `lookup('release-group', mbid, ['ratings','genres','artist-credits','url-rels'])`；从 `artist-credit[0].artist` 取 `id/name/sort-name/country`。`country` 缺失时才对该 artist 做一次 `lookup('artist', mbid)`，取 `country/area/begin-area`。
- **归一化**：`country` 优先；缺失时用 `area['iso-3166-1-codes']`；再缺失时用 area 名称/常见城市映射（台北→TW、香港→HK、北京→CN 等）；无法识别一律留空，不猜。地区键统一为大写 ISO 3166-1 alpha-2 代码。
- **展示口径**：CN→中国大陆、TW→中国台湾、HK→中国香港、MO→中国澳门；其他 ISO 码用 `Intl.DisplayNames('zh-CN')` 生成中文名，失败则回退原始代码。
- **补全时机**：新专辑在现有补全流程中顺带写入；存量专辑通过一次性批量回填完成（用户已完成，入口随后移除）。失败时保持 `region_checked_at` 为空，后续重新补全/重新同步可再次尝试。
- **手动编辑不提供**：`region` 只由 MB 写入；MB 无数据时专辑显示「—」。
- **导出导入**：`artist` 表随数据导出；导入按 MBID upsert；专辑的 `primary_artist_mbid` / `region_checked_at` 加入显式列清单，旧版导出按 NULL 处理。
