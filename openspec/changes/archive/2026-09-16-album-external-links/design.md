# 技术方案

## 1. 数据源与抽取规则

### 1.1 请求

复用数据补全已有的 release-group lookup，只加一个 include：

```ts
// enrich-service.ts — matchAlbum / processConfirmedMatch 两处
mbApi.lookup('release-group', mbid, ['ratings', 'genres', 'url-rels'])
```

**零额外请求**：补全路径本来就要发这一次 lookup。惰性回填路径（第 3 节）才需要独立发请求。

### 1.2 抽取

新增 `src/main/enrich/external-links.ts`，供补全路径与惰性回填路径共用：

```ts
export type ExternalLinkKey = 'rym' | 'discogs' | 'allmusic' | 'lastfm' | 'wikipedia'
export type ExternalLinks = Partial<Record<ExternalLinkKey, string>>

/** host 后缀 → 存储键。用后缀匹配以覆盖 www. / 各国子域 */
const HOST_WHITELIST: [string, ExternalLinkKey][] = [
  ['rateyourmusic.com', 'rym'],
  ['discogs.com', 'discogs'],
  ['allmusic.com', 'allmusic'],
  ['last.fm', 'lastfm'],
  ['wikipedia.org', 'wikipedia']
]

export function extractExternalLinks(relations: MbRelation[]): ExternalLinks
```

**必须按 URL host 匹配，不能按 `rel.type`**：实测 RYM 链接的 type 是通用的 `other databases`，同一 type 下还混着 last.fm、musik-sammler、offiziellecharts、spirit-of-rock 等。按 type 筛会同时漏掉和误收。

匹配规则：取 `rel.url.resource`，`new URL()` 解析后取 `hostname`，与白名单做 `hostname === domain || hostname.endsWith('.' + domain)`。同一 key 出现多次时取第一条。`new URL()` 抛错的条目直接跳过（MB 里存在少量畸形 URL）。

其中 `rym` 键**照常抽取但不被消费**（详情面板恒用搜索页，理由见第 4 节）。

## 2. 存储设计

```sql
ALTER TABLE album ADD COLUMN external_links TEXT
```

| 取值 | 含义 | 行为 |
| --- | --- | --- |
| `NULL` | **未回填** | 详情面板打开时触发惰性查询 |
| `'{}'` | 已查询过，但没有任何白名单链接 | 不再查询 |
| `'{"rym":"https://..."}'` | 有链接 | 直接渲染 |

**NULL 与 `{}` 必须区分**——否则「确实没有 RYM 链接」的专辑（华语专辑里很常见，见第 6 节）每次打开面板都会重查一遍。这与 `artists` 列 `NULL = 未回填` 是同一套语义。

写入封装在 `album-service.ts`：`setAlbumExternalLinks(albumId, links)`，`JSON.stringify` 后落库。**仅在查询成功时调用**——查询失败保持 NULL，下次打开面板自然重试（不写 `{}`，否则一次网络抖动会把该专辑永久钉死成「无链接」）。

## 3. 惰性回填

新增 IPC `album:ensureExternalLinks(albumId)`：

```
渲染层选中专辑
  → 若 external_links 非 null，或有 external_links 但无 musicbrainz_id → 直接返回，不发请求
  → 否则 lookup('release-group', mbid, ['url-rels'])
      ├─ 成功 → extractExternalLinks() → setAlbumExternalLinks() → 返回 links
      └─ 失败 → 返回 null，不写库
```

限流韧性：复用 `mb-client.ts` 现有的 1 req/s 客户端，请求自然排队而非失败。**每张专辑一生只查一次**（成功后写入 `{}` 或实际链接），因此即使用户快速连点专辑，累计请求量也被专辑数封顶。

渲染层调用点：`App.vue` 的选中逻辑中，与现有的曲目拉取（`track:listByAlbum` 自带惰性补全）并列。**不阻塞面板渲染**——先按当前数据渲染（此时只有 RYM 入口与 MB/网易云链接，其余站点链接待查询返回后出现）。

## 4. RYM 入口：恒用搜索页

```ts
export function rymSearchUrl(artist: string, title: string): string {
  const q = encodeURIComponent(`${artist} ${title}`)
  return `https://rateyourmusic.com/search?searchterm=${q}&searchtype=l`
}
```

`searchtype=l` 限定搜 release。该格式被 MusicBee / Mp3tag / foobar2000 长期沿用，稳定。

**方案修订（用户实测后）**：最初的设计是「有 MB 直链用直链，没有才降级搜索页」，前提假设是「MB 社区人工维护的 URL 必然有效」。用户实测推翻了这一点——**面板里指向 RYM release 页的直链点不开**。可能的原因有两个，都无从在客户端绕过：

- MB 记录的 slug 与 RYM 当前地址不符（slug 规则历史上变过，见 proposal 的实测发现 1）；
- 或 RYM 对从外部直达 release 页的请求有拦截，而搜索页作为常规入口不受影响。

无论哪个原因，结论都是：**MB 里的 rym 直链不可消费**。搜索页不依赖 slug 规则，是唯一可靠的入口形式，因此改为**恒用搜索页**。

`external_links.rym` 字段**照常采集但不再有消费方**。保留的理由：它与其余字段共用同一次 lookup，零额外成本；且记录了「MB 是否收录了这张专辑的 RYM 链接」这一信息，将来若 RYM 放开直达或 slug 问题查清，可直接启用。

**曾经的遗留风险（已排除）**：搜索页与 release 页同属 rateyourmusic.com，若 RYM 的拦截是**整域**级别的，搜索页同样打不开。2026-09-16 用户实测**搜索页可正常打开**，说明拦截是 release 直达级别（或 slug 不匹配），搜索页方案成立。若将来搜索页也失效，退路是 Google 站内搜索：`https://www.google.com/search?q=site:rateyourmusic.com <艺术家> <专辑名>`。

## 5. UI

`App.vue` 的 `.detail-links` 区域（现已有 MusicBrainz、网易云两个链接）改为按计算属性渲染：

| 链接 | 显示条件 | 目标 |
| --- | --- | --- |
| 🎧 RateYourMusic | **恒显示** | **恒为搜索页**，不读 `external_links.rym` |
| 💿 Discogs | 有 `external_links.discogs` | 直链 |
| 🎼 AllMusic | 有 `external_links.allmusic` | 直链 |
| 📻 Last.fm | 有 `external_links.lastfm` | 直链 |
| 📖 Wikipedia | 有 `external_links.wikipedia` | 直链 |
| 🔗 MusicBrainz | 有 `musicbrainz_id` | 不变 |
| 🎵 网易云音乐 | 有 `netease_original_id` | 不变 |

RYM 恒显示且恒为搜索页是关键——它是本需求的目标入口，任何时候都必须可点，因此不能有「未补全所以没有链接」这种死路，也不能依赖 MB 那条不可靠的直链。**RYM 入口因此与 `external_links` 的回填状态完全无关**，不需要 loading 态或占位符。

其余站点的直链未收到同类反馈（Discogs / AllMusic / Last.fm / Wikipedia 的 URL 结构稳定，且不像 RYM 那样有 slug 漂移与反爬），保持直链不变。

全部走现有 `openExternal` IPC，无新增打开逻辑。

## 6. 覆盖率与实测数据（QA 基线）

用 MB 实测 10 张专辑（脚本见附录 A），**样本很小，只能当参考不能当比例**：

| 类别 | 有 RYM 直链 |
| --- | --- |
| 知名欧美 | 4/4 —— Radiohead、MBV、Fishmans、Have a Nice Life |
| 华语 | **1/5** —— 王菲《浮躁》有；崔健《新长征路上的摇滚》、窦唯《黑梦》、万青《万能青年旅店》、郭顶《飞行器的执行周期》**均无** |

华语专辑正是本库主体。原本这张表是用来论证「兜底搜索链接是必需项而非锦上添花」；在 RYM 入口改为恒用搜索页之后，这张表的结论只剩参考价值——**搜索页对 100% 的专辑都可用**，MB 有无收录 RYM 链接已不影响可点性。

另注：MB 的 `genres` 字段实测比预期好（OK Computer 返回 13 个），此前「MB genres 稀疏」的判断对该专辑不成立；`tags` 则混有大量噪声（`i own this`、`cd`、`owned` 等收藏标记）。这与本需求无关，仅记录备查。

## 7. Spec 变更清单

| Spec | 变更 |
| --- | --- |
| `local-storage` | Album 表字段清单加 `external_links`；新增迁移 scenario；导入导出 scenario 补充该字段 |
| `album-detail-expand` | 「详情内容展示」的链接清单加 RYM 等外部链接；新增「RYM 入口恒为搜索页」与「外部站点链接的惰性采集」两个 requirement；「外部链接在系统浏览器中打开」的措辞从「MusicBrainz 链接或网易云链接」放宽为「面板中的外部链接」 |
| `data-enrichment` | 「新专辑自动补全」的匹配成功 scenario 补充顺带写入外部链接；新增 `url-rels` 与 host 白名单的约束；注明 `rym` 字段照常采集但无消费方 |

## 8. 验证要点（用户手动 `npm run dev`）

项目存在既有基线类型错误，不自动跑 typecheck。建议按序验证：

1. **RYM 入口**：选中任一专辑（含未补全、无 `musicbrainz_id` 的），确认 RYM 链接恒显示、且点击后能打开 RYM 搜索页并落到正确专辑。**本次修订的核心验证点**——2026-09-16 已确认搜索页可打开，方案成立。
2. **新专辑**：同步一张新专辑并补全，确认详情面板的 Discogs / AllMusic / Last.fm / Wikipedia 链接正确出现。
3. **惰性回填**：选一张 db 里 `external_links IS NULL` 的存量专辑 → 面板先只有 RYM + MB/网易云 → 短暂后其余站点链接出现；用 SQL 确认该行已写入 JSON。
4. **只查一次**：反复切换选中同一张专辑，确认不产生重复请求（观察 MB 请求日志或二次打开时无延迟）。
5. **导入导出**：导出后清库再导入，确认 `external_links` 字段保留。
6. **失败不写库**：断网后选一张未回填专辑，确认报错但该行仍为 NULL，恢复网络后重选能正常回填。

## 附录 A：探测脚本

用于验证覆盖率或排查某张专辑为何没有链接：

```js
const UA = 'AlbumShelf/1.0.0 (https://github.com/user/album-shelf)'
const get = async (p) => (await fetch(`https://musicbrainz.org/ws/2/${p}`, { headers: { 'User-Agent': UA } })).json()
// 1) 搜索拿 mbid  2) lookup inc=url-rels  3) 在 relations 里找 rateyourmusic.com
```

注意 MB 限速 1 req/s，实测持续请求下会频繁 503，脚本需带退避重试（本次探测用 2s/4s/6s 三次退避）。
