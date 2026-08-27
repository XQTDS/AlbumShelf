# 设计：关注艺术家新专辑动态

## 一、数据源实测结论

> 标注说明：**[实测]** = 真实登录态端到端跑通或命令核实；**[推断]** = 读 ncm-cli dist 代码推断；**[待验证]** = 实现阶段需确认。

### 1.1 `ncm-cli artist songs`

```
ncm-cli artist songs --artistId <加密艺人ID> --limit <n> --offset <n> --startTime <ms> --endTime <ms>
```

- **[实测]** 底层是网易官方 OpenAPI 端点 `/openapi/music/basic/song/artist/bypubtime/get/v2`
- **[实测]** `--artistId` 要求**加密**艺人 ID（32 位 hex），不接受明文 `original_id`
- **[实测]** 返回的是**歌曲列表，不是专辑列表**；每首歌内嵌 `album: { id, originalId, name }`（album 内**无封面、无发行时间**）
- **[实测]** `data` **直接就是歌曲数组**，不是 `album collected` / `search album` 那种 `{ recordCount, records }` 包装。照抄 `response.records` 会永远得到空数组且不报错——实现时踩过一次
- **[实测]** 歌曲字段：`originalId`、`id`、`name`、`duration`、`artists[]`（歌曲级参与者）、`fullArtists[]`、`album`、`coverImgUrl`（歌曲级封面，实际就是专辑封面）
- **[实测]** 输出中**剥离了 `publishTime`**——即使按发布时间窗查询，返回体也不带发行日期。这是必须补 `album get` 的根本原因
- **[实测]** `limit` 上限 100：`--limit 200` 返回 `code 400`「获取指定发布时间内艺人下的歌曲列表数据过多，请检查是否超限」
- **[实测]** `startTime` / `endTime` 为毫秒时间戳，必填，闭区间；无发行的窗口返回 `data: []`
- **[实测]** **翻页：短页不代表结束。** 某艺人 6 年窗口实测 offset=0 → 79 首、offset=100 → **100 首**、offset=200 → 6 首、offset≥300 → 0 首。首页短于 limit 但后面仍有满页，推测是先按 offset 取原始页再过滤/去重（样本中确有同名不同 id 的重复曲目）。**因此 offset 必须按 limit 递增而非按返回条数递增，终止条件必须是空页而不是短页**，否则会重复抓取甚至死循环


### 1.2 为什么必须补 `album get`

`artist songs` 只给出「这首歌属于哪张专辑」，缺三样动态流必需的信息：发行日期、完整艺术家列表（用于分类）、封面 URL。因此对**每个候选专辑**补一次既有的 `getAlbumDetail`（`ncm-cli-service.ts:474`）。候选专辑已先按本地库过滤，调用量可控。

### 1.3 去重键的选择

**唯一可靠键是 `song.album.id`（加密专辑 ID）**，与本地 `album.netease_album_id` 同域可直接比对。

`netease_original_id` **实库约 80% 为空**，绝对不可作为键——这点在设计上必须钉死。

## 二、数据模型

```sql
CREATE TABLE IF NOT EXISTS artist_update (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_name   TEXT NOT NULL,              -- 关注粒度，对齐 followed_artist.name
  album_id      TEXT NOT NULL,              -- 加密专辑 ID，与 album.netease_album_id 同域
  original_id   INTEGER,                   -- 明文专辑 ID，供网易云网页跳转
  title         TEXT NOT NULL,
  publish_time  INTEGER,                    -- 原始毫秒时间戳
  release_date  TEXT,                       -- publishTimeToReleaseDate 换算（北京时间）
  cover_url     TEXT,                       -- 远程 https 直链，不落 cover:// 缓存
  category      TEXT NOT NULL,              -- 'own' | 'participation'
  track_count   INTEGER,                    -- 曲目数（来自 album tracks）
  duration_ms   INTEGER,                    -- 总时长毫秒（album tracks 的 duration 求和）
  found_at      TEXT NOT NULL DEFAULT (datetime('now')),
  seen_at       TEXT,                       -- NULL = 未读
  UNIQUE(artist_name, album_id)
);
CREATE INDEX IF NOT EXISTS idx_artist_update_seen ON artist_update(seen_at);
CREATE INDEX IF NOT EXISTS idx_artist_update_found ON artist_update(found_at DESC);
```

`track_count` / `duration_ms` 为 NULL 表示尚未取到（老数据，或 `album tracks` 拉取失败），UI 整段不渲染而不是显示「0 首」；下次检查会走自愈路径补上（见 §3.5）。

`followed_artist` 增列（守卫式，沿用 `database.ts:110-125` 的 `PRAGMA table_info` 判列惯例）：

```sql
ALTER TABLE followed_artist ADD COLUMN last_checked_at TEXT;  -- NULL = 从未检查
```

**为什么用独立表而不是往 `album` 里塞占位行**：手动同步会删除「不在网易云收藏列表」的本地专辑（`sync-manager.ts:117-118`），未收藏的动态条目若写进 `album` 会被下次同步整片删掉。且 `cover://` 协议强依赖 `album` 行的数字 id（`cover-cache.ts:83`），未入库条目走远程直链即可（CSP `img-src` 已放行 `https:`）。

## 三、检查流程

```
触发（唯一入口：动态 Tab「立即检查」，带用户选中的回溯范围）
  → 单飞标志 artistUpdateCheckRunning 防重入（与 coverFillRunning 等三个先例并列）
  → 登录前置检查（未登录 → 弹登录窗并中止，沿用回填任务模式）
  → lookback 白名单校验（30/90/180/365，非法回落 90）
  → 遍历 followed_artist：
       encrypted_id 为空 → 跳过并计数（完成提示告知）
       startTime = min(now - lookbackDays, last_checked_at)   ← 见 3.2
       endTime   = now
       artist songs（offset 按 limit 递增翻页，每次调用间隔 300ms）
       → 按 song.album.id 聚合去重为候选专辑（空 album 守卫）
       → 剔除本地 album.netease_album_id 已存在者（已入库不打扰）
       → entryStatus(artist, albumId)：
            complete   → 零调用跳过
            incomplete → 只补 album tracks 并 UPDATE（自愈，省一次 album get）
            missing    → album get + album tracks → 分类 → INSERT OR IGNORE
       → 该艺人完全成功 → UPDATE last_checked_at = now
         该艺人任一环节失败 → 不更新水位线（下次重跑自动补齐）
  → 广播 artist-updates:changed，窗口内显示完成统计
```

### 3.1 三条必须遵守的规则（来自方案审查）

1. **水位线只推进成功的艺人。** 若失败也推进 `last_checked_at`，该艺人这段时间窗将被**永久漏检**，且无任何提示。
2. **空 `album` 守卫。** 部分歌曲的 `album` 可能为空对象或缺 `id`，必须过滤，否则聚合时产生脏键。
3. **时区。** `publishTime` 是**北京时间零点的时间戳**，直接取 UTC 日期会早一天。必须走既有的 `publishTimeToReleaseDate`（`ncm-cli-service.ts:307`），该坑项目里已踩过。

### 3.2 回溯范围与水位线的关系

用户在动态 Tab 的下拉里选择本次检查的回溯范围（最近 30 天 / 90 天 / 半年 / 一年，默认 90 天）。
实际扫描窗口取：

```
startTime = min(now - lookbackDays, 该艺人的 last_checked_at)
```

即**至少**扫用户选中的范围，水位线更早时扫到水位线。三种情况都成立：

| 场景 | 水位线 | 用户选择 | 实际扫描 |
|------|--------|----------|----------|
| 想往回翻找漏掉的 | 昨天 | 一年 | **一年**（尊重显式意图） |
| 长期没检查 | 半年前 | 30 天 | **半年**（不漏空档期） |
| 首次检查 | 无 | 90 天 | 90 天 |

换成 `max()` 会让第一种失效（选一年却什么都不扫），直接用 `now - lookbackDays` 覆盖则会让第二种漏掉五个月——两种都错，必须是 `min()`。

**基线批次（该艺人从未检查过）的条目落库即标记已读**，理由：未读数的语义应当是「上次检查之后的新发现」，首开就顶着 100+ 未读是噪音而非信息。而在**已检查过的艺人**上往回翻更久所发现的历史条目算作新发现，标未读——用户主动要求往回看，就该让他看见。

规模预估：90 天 × 58 艺人 ≈ 100-400 张候选专辑，总耗时 **3-10 分钟**（每次 ncm-cli 调用 ≈ 1s + 300ms 限流，弱网最坏 15s 超时 × N）；选一年会显著更久。这个量级必须在 UI 上诚实告知，不能让用户以为卡死。

### 3.3 分类规则（起始启发式，实现阶段需调优）

基于 `album get` 返回的 `artists` 数组：

- `artists` 仅含本人，或 `artists[0]` 是本人 → `own`
- 含群星（`originalId: 122455`）、节目/OST 实体、或艺术家数组过长 → `participation`

**实测噪音约 55%**（合辑 / OST / 综艺）。合辑尤其麻烦：它会把艺人的**老歌**以「新专辑」身份带进动态流——这是 `bypubtime` 端点的固有语义，不是 bug，只能靠分类弱化展示。

**[待验证]** 分类准确率需在实现阶段用真实关注艺人逐个对照调优，不要假设启发式一次就对。

### 3.4 一个无法根治的语义问题

精选集、Remastered 重发、单曲重新上架都会被判为 `own`，因为它们**确实**是「本人名下、在该时间窗内发行」的专辑。这不是可以靠规则修掉的——`bypubtime` 的语义就是发行时间。

**对策是文案而非逻辑**：UI 用「本人名下发行」而不是「新作品 / 新专辑」，让用户预期正确。

### 3.5 曲目数与总时长

动态流里会出现大量只有一首歌的「专辑」——那多半是单曲而非正式发行。**不过滤**（它们确实是新发行，用户可能就想知道），而是把**曲目数与总时长**显示出来让用户自己判断：`1 首 · 3:52` 一眼就能和 `11 首 · 37:01` 区分开。

数据只能来自 `album tracks`，有两条都验证过的理由：

1. `album get` 的返回**不含**这两个字段——实测打印全字段确认（`originalId, id, name, jumpUrl, language, coverImgUrl, company, transName, aliaName, genre, artists, briefDesc, description, publishTime, subed, extMap`）。
2. 按 `artist songs` 的结果聚合会**少算**：那只是该艺人在这张专辑里的歌。合辑里参与 2 首就会显示「2 首」——**正好把合辑误认成单曲**，比不显示更糟。

代价：每张全新候选专辑从 1 次调用（`album get`）变成 2 次（+ `album tracks`），约 +1.3s/张。90 天基线的总耗时预估相应上浮。

**自愈路径**：`entryStatus()` 把已有条目分成 `complete` / `incomplete`（有行但 `track_count` 为 NULL）。`incomplete` 只补拉一次 `album tracks` 并 UPDATE，跳过 `album get`。这样老数据与上次 `album tracks` 失败的条目都会在下次检查时自动补齐，不需要用户清库；`album tracks` 失败时条目照常落库（留空），只是把该艺人标记为未完全成功，水位线不推进。

## 四、加密 ID 覆盖率的机制盲区

当前 58/58 齐备，但机制有**结构性缺口**：`fillMissingIdsFromAlbums`（`followed-artist-service.ts`）只扫本地 `album` 表按名字匹配，**名下没有专辑在库的艺人永远补不到 ID**。而 ncm-cli 的 `artist` 族只有 `songs` 一个命令、入参就是加密 ID——鸡生蛋。

v1 处置：缺 ID 的艺人**跳过并在完成报告中提示**，不静默忽略。

**[待验证]** 兜底反查路径：`search album --keywords <艺术家名>` 的结果里嵌有 `artists[{originalId, id}]`，理论上可反查，但有重名取错人风险。v1 不实现，记录在此供后续评估。

## 五、UI 方案

### 5.1 关注列表窗口双 Tab

窗口尺寸 460×560 → **560×640**（`index.ts:109-115`）。顶部加 Tab 切换「关注 / 动态」，动态 Tab 标题带未读数。

动态 feed 条目复用既有设计语言，不新造：热评 `comment-row` 的行布局、封面三级回退链、chip/tag 体系、`formatCommentTime` 相对时间。

条目内容：封面（远程直链）+ 专辑名 + 分类 chip + **曲目数·总时长** + 艺人名 + 发行日期 + 未读圆点 + 「🎵 网易云音乐」跳转（见 5.2）。`own` 优先排序，`participation` 弱化展示。

顶部工具条常驻「上次检查：N 天前」+ 回溯范围下拉 + 「立即检查」按钮，检查期间在工具条下方显示行内进度条（当前/总数/艺人名）；空态文案引导用户先检查一次。

**这是本功能的唯一入口。** 菜单不新增任何项——菜单入口与 Tab 内按钮功能完全重复，留两个只会让「进度显示在哪个窗口」变成需要解释的问题（进度按 `event.sender` 定向推送给触发方）。代价是发现性依赖「工具 → 关注列表」，可接受。

### 5.2 跳转到网易云

每条动态提供「🎵 网易云音乐」按钮，**完全复用详情面板既有实现**（`App.vue:598-604`）：

```
v-if 守卫 original_id → openExternal('https://music.163.com/#/album?id=' + original_id)
```

链路已通，无需新增 IPC：`shell:openExternal` 通道（`index.ts:359`）与 preload `openExternal`（`preload/index.ts:209`）均已存在。

**关于 `original_id` 的可靠性**：本表的 `original_id` 来自 `album get` 返回的 `NcmCliAlbumDetail.originalId`（类型上非空，`ncm-cli-service.ts:57`），每行都是检查时新鲜抓取的——与 `album` 表里约 80% 为空的历史遗留数据**不是一回事**，跳转按钮实际上几乎不会遇到空值。仍保留 `v-if` 守卫，与详情面板行为一致。

**这是本功能唯一的「出口」**：v1 不做一键入库，用户对某张专辑感兴趣时跳到网易云自行收藏，再走既有手动同步把它带进专辑墙。闭环跨应用完成，动态流本身不写 `album` 表，因此不触碰同步删除语义。

### 5.3 主窗口

**不改动。** 检查入口、进度与完成统计全部收敛在关注列表窗口内，主窗口既不加菜单项也不加进度条。

## 六、IPC 契约

| 通道 | 方向 | 载荷 |
|------|------|------|
| `artistUpdates:check` | invoke | `lookbackDays?: 30\|90\|180\|365` → `{ success, data: { total, own, participation, alreadyOwned, skippedNoId, failed }, loginRequired? }` |
| `artistUpdates:list` | invoke | `unreadOnly?: boolean` → `{ items, unreadCount, lastCheckedAt, running }` |
| `artistUpdates:markRead` | invoke | `id: number` → `{ changed }` |
| `artistUpdates:markAllRead` | invoke | → `{ count }` |
| `artistUpdates:progress` | send | `{ current, total, title }`，按 `event.sender` **定向推送给触发窗口** |
| `artist-updates:changed` | broadcast | 无载荷（复制 `broadcastFollowedChanged`） |

`lookbackDays` 在主进程按白名单校验，非法值回落 90——渲染层传什么都不能直接拿去算时间窗。

preload 需改 3 处（`preload/index.ts` + `index.d.ts` + `registerIpcHandlers`）。渲染进程拿不到 preload 类型（`tsconfig.web.json` 不含 preload），新组件按既有惯例本地声明 interface。

## 七、取关级联

`unfollow()` 增加一行 `DELETE FROM artist_update WHERE artist_name = ?`，避免取关后留下孤儿动态条目。

## 八、已知风险与取舍

| 风险 | 处置 |
|------|------|
| 首启 3-10 分钟长任务（选一年更久） | 行内进度条 + 诚实文案；基线条目标已读避免未读洪泛 |
| 每张新专辑 2 次调用（`album get` + `album tracks`） | 曲目数无其它准确来源（见 §3.5）；`entryStatus` 保证只对全新/不完整条目付这个成本 |
| 大量单曲混在动态流里 | 不过滤，显示「1 首 · 3:52」让用户自行判断 |
| 55% 合辑/OST 噪音 | `album get` 分类 + `participation` 弱化展示；接受无法根治 |
| 精选集/重发被判 `own` | 文案改为「本人名下发行」而非「新作品」 |
| 加密 ID 缺失艺人漏检 | 跳过 + 完成报告提示；反查兜底记录为后续项 |
| 58 次子进程串行调用 | 300ms 限流沿用既有约定；单飞防重入；失败跳过继续 |
| 网易云风控 | 限流 + 严格手动触发（不做自动轮询，天然低频） |
| `artist songs` 深翻页边界未知 | 实现阶段实测 >300 首窗口 |
| 分类启发式准确率未知 | 实现阶段真实艺人逐个对照调优 |

## 九、与既有约定的关系

- **`data-sync` 的「同步仅手动触发」**：本 change 严格遵守同一哲学，不引入 `setInterval`、不挂启动钩子。全仓目前无任何定时调度设施，本次不开这个口子。
- **「只用 ncm-cli 封装、不直连网易云 API」**：严格遵守。演出信息之所以整块砍掉，正是因为唯一可能的路径（网易云「云村有票」逆向、票务平台抓取）都会破坏这条原则。
