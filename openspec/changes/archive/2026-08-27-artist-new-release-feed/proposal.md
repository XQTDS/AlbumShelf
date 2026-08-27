# 关注艺术家新专辑动态（artist-update-feed）

## Why

`2026-08-26-artist-follow` 落地了关注能力，并在非目标中写明「不做『关注艺术家的新专辑』提醒/列表（后续 change，依赖本次落库的 artistId）」。本次 change 就是那个后续。

用户诉求：**保持对关注艺术家动态的关注（新专辑、演出信息）**。经一轮可行性探索（见 `docs/artist-updates-exploration.md`，本地文档未入库）：

- **新专辑可做**：`ncm-cli artist songs --artistId <加密ID> --startTime --endTime` 已用真实登录态端到端实测跑通，底层是网易官方 OpenAPI 的 `bypubtime` 端点；当前 58 位关注艺人加密 ID 100% 齐备，可直接入参。
- **演出不可做**：ncm-cli 无任何演出/票务命令；国际源全部不可用（Songkick 关闭申请、Bandsintown 2025 起合作制、Last.fm events 已下线、MusicBrainz event 实测稀疏、Ticketmaster 无中国大陆覆盖）；国内源只有网页抓取形态且平台 ToS 均禁止；网易云「云村有票」无公开接口，直连逆向违反本项目「只用 ncm-cli 封装」的架构原则。**v1 完全不做演出，不以任何形式假装有这块数据。**

因此本次 change 的范围收敛为：**关注艺术家的新专辑发现与已读管理**。

## What Changes

- **ncm-cli 适配层**：在既有预留区（`ncm-cli-service.ts:548-559`，上次 change 已写好签名注释桩）实现 `getArtistSongs(encryptedArtistId, startTime, endTime)`，含 `offset` 翻页与 `NcmCliArtistSong` 类型
- **数据模型**：
  - 新表 `artist_update`（动态条目，`UNIQUE(artist_name, album_id)` 幂等去重；含明文 `original_id` 供网易云跳转）
  - `followed_artist` 新增 `last_checked_at` 列（增量水位线，守卫式 ALTER）
  - **不新增 `album` 表列**，动态条目与专辑库完全解耦（避免被同步删除语义冲掉）
- **服务层**：新增 `ArtistUpdateService` —— 单飞防重入、登录前置、逐艺人时间窗增量抓取、可选回溯范围（30/90/180/365 天）、`album get` 补详情与分类、已入库跳过、水位线只推进成功的艺人
- **IPC/preload**：`artistUpdates:check`（带 `lookbackDays`）/ `artistUpdates:list` / `artistUpdates:markRead` / `artistUpdates:markAllRead`，`artistUpdates:progress` 进度事件、`artist-updates:changed` 跨窗口广播（复制 `broadcastFollowedChanged` 模式）
- **UI**：
  - **唯一入口在关注列表窗口**：菜单不新增任何项（检查入口与 Tab 内按钮功能完全重复，只保留后者）
  - 关注列表窗口改造为「关注 / 动态」双 Tab，窗口尺寸 460×560 → 560×640
  - 动态 Tab = 信息流（封面 + 标题 + 分类 chip + 发行日期 + 未读圆点），支持单条已读与「全部标记已读」，含空态与「上次检查：N 天前」提示
  - 条目「🎵 网易云音乐」跳转按钮：`shell.openExternal` 打开该专辑的网易云页面，用户可在那边收藏后走既有手动同步入库
  - 工具条提供回溯范围下拉（最近 30 天 / 90 天 / 半年 / 一年，默认 90 天）与「立即检查」，检查进度显示在窗口内

## Capabilities

### New Capabilities

- `artist-update-feed`：关注艺术家新专辑的增量发现、分类、去重落库、已读管理与信息流展示

### Modified Capabilities

- `artist-follow`：`followed_artist` 新增 `last_checked_at`；取关时级联清理该艺人的动态条目；关注列表窗口改为双 Tab
- `local-storage`：`artist_update` 新表
- `ncm-cli-adapter`：`artist songs` 命令封装落地（预留区兑现），补充实测的返回结构与翻页语义

## Non-goals

- **不做演出/巡演/票务的任何形态**——包括结构化数据、手动记录、以及外部搜索跳转入口。经论证数据源不可得，v1 不留半成品入口（用户明确选择「演出先完全不做」）
- **不做一键入库**——动态流只做「发现 + 已读」。`album:addToCollection` 只写本地不收藏到网易云，而手动同步会删除不在网易云收藏列表的专辑（`sync-manager.ts:117-118`），入库的专辑下次同步必被删；v1 回避该冲突，不新增 `album.user_added` 豁免列。**但动态条目提供「🎵 网易云音乐」跳转按钮**（复用详情面板既有实现），用户在网易云收藏后走既有手动同步入库——闭环由用户跨应用完成，不由本功能写库
- **不做自动/定时/启动时检查**——严格手动触发，与 `data-sync` 的「同步仅手动触发」保持同一产品哲学。且 Windows 上关窗即 `app.quit()`（`index.ts:381-385`）无后台驻留，定时检查价值本就有限。自动轮询如需要，另开 change 单独论证
- 不做系统通知 / 任务栏角标 / 托盘提醒（全仓尚无 `Notification` / `setBadgeCount` / `Tray` 使用，且未调 `app.setAppUserModelId`）
- 不做 MusicBrainz release-group 交叉补漏（实测录入延迟约一周、有覆盖盲区）
- 不做多数据源 provider 抽象（当前只有一个源，抽象无收益）
- 不做独立「动态」窗口与主窗口未读角标（v1 用关注窗口双 Tab，改动面最小）
- 动态条目不并入导出/导入（不升 v3）
- 不做重名艺术家消歧（沿用 `followed_artist` 按名字的既有粒度）

## Impact

- **主进程**：[database.ts](../../../album-shelf/src/main/database.ts) `artist_update` 建表 + `followed_artist.last_checked_at` 迁移列；`artist-update-service.ts` 新增；[ncm-cli-service.ts](../../../album-shelf/src/main/ncm-cli-service.ts) 预留区实现 `getArtistSongs`；[ipc-handlers.ts](../../../album-shelf/src/main/ipc-handlers.ts) 新增 handler、检查任务编排与动态变更广播；[followed-artist-service.ts](../../../album-shelf/src/main/followed-artist-service.ts) 取关级联清理；[index.ts](../../../album-shelf/src/main/index.ts) 关注窗口尺寸（菜单不改）
- **preload**：[index.ts](../../../album-shelf/src/preload/index.ts)、[index.d.ts](../../../album-shelf/src/preload/index.d.ts) 新 API 与类型
- **渲染层**：[FollowedArtistsWindow.vue](../../../album-shelf/src/renderer/src/FollowedArtistsWindow.vue) 双 Tab 改造 + 动态 feed + 回溯范围下拉 + 行内进度（[App.vue](../../../album-shelf/src/renderer/src/App.vue) 不改动）
- **文档**：[README.md](../../../README.md) 功能特性
- **已知取舍**：见 design.md「已知风险与取舍」
