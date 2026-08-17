## Context

- ncm-cli 0.1.6 提供 `comment list-hot --type album --resourceId <32位hex> --limit N --offset M`，返回标准 `{ code, data }` 结构，可复用 `NcmCliService.execute<T>()`（ncm-cli-service.ts:196）。
- 实测返回结构：`data.recordCount` 为真实总数（区别于 `album collected` 恒为 0），`data.records` 为评论数组，单条含 `id`（hex）、`content`、`likedCount`、`creator`（nickname / avatarUrl / signature 等）、`time`（毫秒时间戳）、`liked`。
- 数据库专辑的 `netease_album_id` 即命令所需的加密 ID，无需转换。
- 详情面板已有选中加载 + 内存缓存先例：`trackCache` / `loadTracks`（App.vue:655-672）、封面进行中去重 `coverLoadingSet`（App.vue:677）。
- 头像 URL 为 http 协议，需按现有惯例转 https（ipc-handlers.ts:185 同款处理）。

## Goals / Non-Goals

**Goals:**
- 选中专辑时在详情面板展示网易云热门评论（首屏 20 条）
- 评论新鲜度可控：内存缓存 5 分钟 TTL + 手动刷新按钮
- 复用现有 IPC / preload / 详情面板模式，无数据库与依赖变更

**Non-Goals:**
- 不做评论持久化缓存（热评会变化，落库无意义）
- 不做「加载更多」分页（热评分页在热度变化时不稳定，易出现重复评论）
- 不发评论 / 回复 / 点赞（ncm-cli 的 `comment post` / `comment reply` 留待后续）
- 不做「最新评论」（ncm-cli 未暴露该接口）

## Decisions

### 1. 缓存策略：渲染进程内存 + 5 分钟 TTL + 手动刷新

**决策**：`commentCache` 为 `Map<albumId, { comments, recordCount, fetchedAt }>`，命中且 `Date.now() - fetchedAt < 5min` 直接返回；超出 TTL 或用户点「刷新」按钮时重新拉取。纯内存，应用退出即失效。
**理由**：热评随时可能变化，无过期时间的会话缓存（trackCache 模式）会导致整个会话看到旧数据；完全不缓存则快速切换专辑时频繁打网易云接口，有频控风险。TTL 在新鲜度与频控之间取平衡。
**备选方案**：无缓存每次必拉（更新鲜，但切换专辑高频触发接口）；持久化缓存（被否决，热评会变化）。

### 2. 单次拉取 20 条，不做分页

**决策**：`limit = 20`、`offset = 0`，区块内一次性渲染；不提供「加载更多」。
**理由**：热评按热度排序，翻页时排序变化会导致 offset 页内容位移、出现重复评论；20 条热评对详情面板足够。

### 3. 登录不前置拦截，失败降级为区块内错误态

**决策**：`album:comments` 不预先检查登录态；调用失败时返回错误信息，前端在评论区块内显示「加载失败 + 重试」，若为 `NcmLoginRequiredError` 则提示需要登录。
**理由**：热评在网易云 Web API 上是公开数据，实测登录态下可正常拉取，预期无需登录（未登录场景留待用户验证）；评论是锦上添花的只读功能，不值得像播放/同步那样强制弹登录窗打断浏览。
**风险**：若实测未登录不可用，则 UI 会提示登录——升级为登录引导的成本很低（已有 LoginModal 机制）。

### 4. 头像 http→https 转换放在后端 handler

**决策**：`album:comments` handler 中对每条评论的 `creator.avatarUrl` 做 `http→https` 转换后再返回。
**理由**：与封面 URL 的既有处理位置一致（ipc-handlers.ts:185、262），前端拿到即可直接渲染。

### 5. 通道命名与返回结构

**决策**：通道名 `album:comments`，入参 `albumId`（本地数据库 ID），返回 `{ recordCount, comments }`。专辑无 `netease_album_id` 时直接返回 `{ recordCount: 0, comments: [] }`（前端隐藏区块）。
**理由**：对齐 `track:listByAlbum` 的入参习惯（本地 ID，后端自行解析关联数据）。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| 未登录场景下热评接口可能不可用 | 区块内错误态提示登录，不影响其他功能；必要时后续加登录引导 |
| 频繁切换专辑触发网易云频控 | TTL 缓存 + 进行中请求去重（`commentLoadingAlbums` Set） |
| 热评分页位移导致重复评论 | 只拉首屏 20 条，不做分页 |
| ncm-cli 调用超时（15s）阻塞加载 | 区块内显示加载中，失败后可点重试；不阻塞详情面板其他内容 |
