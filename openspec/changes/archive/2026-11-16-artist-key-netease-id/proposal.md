# 艺人表改用网易云艺人 ID 作为业务键

## 背景

当前 `artist` 表以 MusicBrainz Artist MBID 为唯一键，专辑通过 `primary_artist_mbid` 关联。这导致：

- MB 匹配失败的专辑（如《旺福 同名专辑》）没有 `primary_artist_mbid`，即使同一网易云艺人已有地区行也 JOIN 不到；
- 需要额外的「本地推断兜底」按网易云艺人 ID 反推 MBID；
- 艺人身份在应用里本质是网易云艺人（`album.artists[0].originalId`），MBID 只是地区数据的来源。

用户确认：**艺人表的 key 直接使用网易云艺人 ID**。

## 目标

- `artist.netease_artist_id` 成为唯一业务键；`musicbrainz_artist_id` 退化为属性（地区来源）。
- 专辑新增 `primary_artist_id`（网易云明文艺人 ID），地区通过 `JOIN artist ON artist.netease_artist_id = album.primary_artist_id` 得到。
- 所有有结构化 `artists` 的专辑（包括无 MB 匹配的）都能关联到艺人行，从而继承地区。
- 移除上一版「本地推断兜底」——新的关联键让它不再需要。
- 导出格式升级到 version 4，兼容 v1/v2/v3 导入。

## 非目标

- 不把地区值冗余存到专辑行。
- 不做手动地区编辑，不抓取外部站点。
- 不重建 `album` 表：保留旧 `primary_artist_mbid` 列作为历史/迁移字段，查询与展示不再使用（迁移读取、导入只写目标库有效 MBID）；`artist` 表在旧库 `musicbrainz_artist_id` 仍为 NOT NULL 时会重建。
- 不要求 `musicbrainz_artist_id` 一一对应：同一 MBID 可对应多个网易云艺人 ID，通过「归属行 + 地区复制」处理。

## 方案概述

新增迁移 `ensureNeteaseArtistIdentity`（启动时幂等执行）：

1. 解析每张专辑 `artists[0]` 的网易云主艺人 ID（`originalId`）、加密 ID 与名称。
2. 按网易云主艺人 ID 分组；组内候选 MBID 从**有 MB 匹配**的专辑收集。
3. 选主 MBID：优先有非空 `region` 的候选，其次专辑数最多，最后按 MBID 字典序。
4. 把选定 MBID/地区写到该网易云艺人行；若 MBID 已被另一个网易云行占用，则复制 `country/area/region/region_fetched_at` 到本行但保持 `musicbrainz_artist_id = NULL`（满足现有 MBID UNIQUE 约束）。
5. 为所有网易云主艺人 ID 确保存在 artist 行（无 MB 数据的行地区为空，后续有 MB 匹配时自动填充）。
6. 回填 `album.primary_artist_id`。

运行时补全改为按网易云艺人 ID upsert；已有地区的行保留首个地区（first-wins），避免同一艺人的地区在多次补全间抖动。

导出升到 version 4，包含新的 artist 列与 `primary_artist_id`；v3 导入后由同一迁移函数把 MBID 行关联到网易云 ID。
