# 专辑外部链接（RYM 等）采集与展示

## 背景

用户希望从 RateYourMusic（RYM）获取专辑的 Genres，理由是 RYM 的风格数据比 MusicBrainz 更全。但 RYM **没有任何官方 API**，且 ToS 明确禁止自动抓取，站点由 Cloudflare Bot Management 防护——实测现成的开源方案（`pyrateyourmusic`）自己文档里就写明 release 详情页在机房 IP 上会被源站限流、反复返回 503，必须挂 FlareSolverr 或住宅代理。绕过技术保护措施不在本项目范围内，这条路走不通。

**但换个目标就完全可行**：不给用户 RYM 的 genre 数据，只给用户**能点进去的 RYM 链接**，让用户自己在浏览器里看。这是纯导航功能，不复制 RYM 的任何内容。

关键在于链接**不需要猜，也不需要对 RYM 发请求**——MusicBrainz 的 URL 关系里存着社区人工维护的 RYM 直链。实测（`GET /ws/2/release-group/<mbid>?inc=url-rels`）：

```
Radiohead - OK Computer        → https://rateyourmusic.com/release/album/radiohead/ok_computer/
王菲 - 浮躁                     → https://rateyourmusic.com/release/album/王菲/浮躁/
My Bloody Valentine - Loveless → https://rateyourmusic.com/release/album/my-bloody-valentine/loveless/
Have a Nice Life               → https://rateyourmusic.com/release/album/have-a-nice-life/deathconsciousness/
Fishmans - Long Season         → https://rateyourmusic.com/release/album/fishmans/long-season/
```

三个必须记录在案的实测发现：

1. **不能自己拼 slug**。`OK Computer` 的 slug 是 `ok_computer`（**下划线**），而 MB 社区讨论里记录逗号会变双下划线（`whatever_people_say_i_am__thats_what_im_not`）、`&` 要转成 `and`，规则不统一且会漂移。自己拼会静默 404。
2. **链接的 `type` 是通用的 `other databases`**，同一 type 下混着 last.fm、musik-sammler、offiziellecharts 等。过滤只能按 **URL host**，不能按 type。
3. **MB 存的 RYM 直链同样点不开**（用户实测）。原以为「从 MB 取现成 URL」即可靠，实际不然——MB 记录的 slug 与 RYM 当前地址不符，或 RYM 拦截直达访问。**因此 RYM 入口最终改为恒用搜索页**，不依赖 MB 的 URL 准确性。这条推翻了最初的方案判断，也是唯一可靠的入口形式。

同一份 `relations` 里还白拿着 Discogs / AllMusic / Last.fm / Wikipedia 的链接（例如 `https://www.discogs.com/master/21491`），一次 lookup 全部到手，顺带存下来。

## 目标

- 专辑详情面板提供 **RYM 入口**，点击用系统浏览器打开；**恒指向 RYM 搜索页**（`/search?searchterm=<艺术家 专辑名>&searchtype=l`，该格式为 MusicBee / Mp3tag / foobar2000 长期沿用），保证**任何专辑在任何时刻都点得进去**，不留死路。
- 顺带采集并展示 Discogs / AllMusic / Last.fm / Wikipedia 链接。
- 采集**不增加任何 MB 请求**：复用数据补全本来就要发的那次 release-group lookup，只加一个 `url-rels` include。
- 新增专辑由补全流程自动获得链接；存量专辑**惰性自愈**（见「非目标」中对批量回填的说明）。

## 非目标

- **不抓取 RYM 的任何页面**，不绕过 Cloudflare，不代理用户流量。本需求只提供跳转链接。
- **不做批量回填菜单项**（偏离原定范围，理由如下）：
  - 本机库 **2564 张**专辑，按 MB 的 1 req/s 全量回填约需 **43 分钟**；
  - 实测中 MB 在持续请求下**频繁返回 503**（本次探测 10 张专辑时就撞了 5 次），长时间批量跑需要页级退避重试，稳定性差；
  - 项目已有**同类惰性自愈先例**——`album-detail-expand` 的「选中详情时自动补全曲目数据」就是面板打开时按需拉取并落库；
  - 刚归档的 `2026-09-16-remove-obsolete-backfill-menu-items` 正在**清理批量回填菜单项**，其中「补全缺失封面」被删的理由正是「封面链路本身自愈」。
- 惰性方案对用户实际会看的专辑效果完全一致，且**RYM 入口恒为搜索页，让 100% 的专辑立即可点**。若后续确需全量直链，可另开 change 加批量入口。
- 不采集 MB `relations` 里的乐评链接（`type=review`）、歌词、榜单等——噪声大、时效性差。
- 不改变任何 RYM 数据的本地存储：本需求**不引入 RYM 的 genres 字段**，MB 仍是风格标签的唯一来源。
- 不做链接有效性校验（不主动请求 RYM 验证 404）。

## 方案概述

详见 design.md。核心决策：

- **数据源**：补全流程的 `lookup('release-group', mbid, [...])` 加 `'url-rels'`，从返回的 `relations` 里按 **URL host 白名单**抽取（`rym` / `discogs` / `allmusic` / `lastfm` / `wikipedia`），存为 JSON。
- **存储**：`album.external_links TEXT`（JSON），**NULL = 未回填**，`{}` = 已查询过但无任何链接。用 NULL 与空对象区分，避免对「确实没有链接」的专辑反复查询（与 `artists` 列同款语义）。
- **惰性回填**：详情面板打开且该专辑 `external_links IS NULL` 且有 `musicbrainz_id` 时，异步 lookup 一次并落库，UI 自动补上 Discogs / AllMusic / Last.fm / Wikipedia 链接。
- **RYM 恒为搜索页**：不读 `external_links.rym`，不依赖 MB 存的 URL 是否有效，任何专辑在任何时刻都可点。`external_links.rym` 照常采集但无消费方（零成本，且记录了 MB 收录情况）。
- **导入导出**：`importDatabase` 的 album INSERT/UPDATE 列清单需同步加 `external_links`，否则导入会静默丢字段。
