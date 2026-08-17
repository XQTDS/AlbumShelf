## Context

- 专辑封面只存远程 URL（`album.cover_url`），不存图片文件。
- 同步来源（ncm-cli `album collected`）常返回空 `coverImgUrl`，加上历史数据，库中存在大量 cover_url 为空的专辑。
- 现有单张补全路径：`album:fetchCover`（选中专辑时按需触发，ipc-handlers.ts:160-195）通过 ncm-cli `album get --albumId <id>` 获取详情并持久化 `coverImgUrl`。

## Goals / Non-Goals

**Goals:**
- 一键批量补全所有 cover_url 为空且有 netease_album_id 的专辑
- 过程可视化：进度条显示当前/总数与专辑名，完成后展示成功/失败统计
- 幂等：重跑只处理仍缺失的专辑

**Non-Goals:**
- 不下载封面图片文件到本地（仅补 URL）
- 不自动重试失败项（重跑即增量收敛）
- 不覆盖已有 cover_url（仅补空值）

## Decisions

### 1. 批量循环采用顺序执行 + 300ms 节流

**决策**：单个顺序 for 循环逐个调用 `getAlbumDetail`，每次调用间隔 300ms。
**理由**：
- 与现有 `album:verifyIds`（ipc-handlers.ts:714-789）批量模式完全一致，有先例可循
- ncm-cli 每次调用 spawn 一个子进程（ncm-cli-service.ts:196-250），并发池会放大网易云风控风险；项目无任何并发工具依赖
- 每张约 1~2 秒，配合进度条可接受
**备选方案**：并发 3~5 的小型 promise 池（更快，但需引入新的并发控制代码，且无先例）。

### 2. 失败不重试，靠重跑收敛

**决策**：单张失败（超时/网络错误/网易云无封面）计入 failed 继续，不自动重试。
**理由**：批量目标集是"cover_url 仍为空"的专辑，重跑天然只补上次失败的，自动重试反而拖慢整体进度。

### 3. 登录前置检查 + 循环内兜底

**决策**：开始前用 `ncmCliService.getLoginStatus()` 检查登录，未登录直接 `authService.triggerLoginPopup()` 并返回 `loginRequired: true`；循环内 catch `NcmLoginRequiredError` 时中止并同样处理（复用 auth-service.ts:129-146 机制）。
**理由**：避免未登录时几百次无效调用；登录态中途失效（如 token 过期）也能立即止损并弹出登录窗。

### 4. 通道命名与结果结构

**决策**：`album:coverFillStatus` / `album:coverFillStart` / `album:coverFillProgress`，进度 payload `{ current, total, albumTitle, filled }`，结果 `{ total, filled, failed }`；防重入用模块级 `coverFillRunning` 标志。
**理由**：对齐现有 `album:verifyProgress` 与 `enrich:status` 的命名和结构习惯。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| 批量调用触发网易云限流 | 300ms 间隔；失败项可通过重跑补上 |
| 补全中途退出（关闭应用） | 已完成的立即持久化，未完成的下次重跑 |
| ncm-cli 超时（15s）拖慢整体 | 失败计入统计并继续，不影响其他专辑 |
