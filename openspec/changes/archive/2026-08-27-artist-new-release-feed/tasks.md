# 任务

- [x] 可行性探索（workflow 14 agent：代码盘点 ×4 + 数据源调研 ×3 + 方案 ×3 + 对抗式审查 ×3 + 综合；报告见 `docs/artist-updates-exploration.md`）
- [x] OpenSpec 变更文档（本目录 proposal/design/tasks）
- [x] `ncm-cli-service.ts`：在预留区实现 `getArtistSongsPage` / `getArtistSongsInWindow`——`offset` 翻页、`NcmCliArtistSong` / `NcmCliSongAlbum` 类型（无包装层类型——`data` 直接是数组）、空 `album` 守卫、10 页安全上限
- [x] **实测 `artist songs` 真实返回结构**：真实登录态验证完成。**发现并修复一个真 bug**——`data` 直接是歌曲数组，不是 `{ recordCount, records }` 包装，原按 `response.records` 解析会永远返回空数组且不报错。结论已回写 design.md §1.1
- [x] **实测深翻页边界**：`limit` 上限 100（200 → code 400）；**短页不代表结束**（实测 offset=0 → 79、offset=100 → 100、offset=200 → 6、offset≥300 → 0），offset 必须按 limit 递增、终止条件必须是空页。结论已回写 design.md §1.1 与代码注释
- [x] `database.ts`：`artist_update` 建表（含两个索引）+ `followed_artist.last_checked_at` 守卫式 ALTER
- [x] 新建 `artist-update-service.ts`：落库（`INSERT OR IGNORE` 幂等）、列表查询、单条/全部已读、未读计数、`entryStatus` 三态判断、`fillTrackInfo` 自愈、按艺人级联删除
- [x] `artist_update` 落库时保存 `album get` 返回的明文 `originalId`（供跳转用）
- [x] `ipc-handlers.ts` 检查编排器：单飞 `artistUpdateCheckRunning` + 登录前置 + `lookbackDays` 白名单校验 + 逐艺人时间窗（`min(now - lookbackDays, 水位线)`）+ 300ms 限流（覆盖 `artist songs` / `album get` / `album tracks` 三类调用）+ **水位线只推进完全成功的艺人** + 已入库 `netease_album_id` 跳过 + `entryStatus` 三态分流（complete 零调用 / incomplete 只补 tracks / missing 走完整流程）+ `album get` 补详情与分类 + 完成统计
- [x] 首次检查（无水位线）的基线批次标记已读（`seen_at` 写入），避免未读洪泛
- [x] `followed-artist-service.ts`：`unfollow()` 事务内级联 `DELETE FROM artist_update`；新增 `listCheckTargets` / `updateLastChecked` / `getLastCheckedAt`
- [x] IPC + preload 全链路：4 个 invoke 通道 + `artistUpdates:progress` 事件 + `artist-updates:changed` 广播；`preload/index.ts` + `index.d.ts` 同步
- [x] `index.ts`：关注窗口尺寸 460×560 → 560×640（**菜单不新增项**）
- [x] `FollowedArtistsWindow.vue`：双 Tab 改造（关注 / 动态，动态 Tab 带未读红点计数）
- [x] **回溯范围可选**：工具条下拉（最近 30 天 / 90 天 / 半年 / 一年，默认 90），语义为 `min(选中范围, 水位线)`——至少扫选中范围，水位线更早则扫到水位线
- [x] **唯一入口收敛到关注窗口**：移除菜单「检查关注艺术家新专辑」及 `menu:checkArtistUpdates` 通道；App.vue 相关接线（handler / 进度条 / 监听 / 清理）全部回滚
- [x] 动态 feed UI：封面远程直链（失败回退 💿 占位）+ 标题 + 分类 chip + 曲目数·总时长 + 发行日期 + 未读圆点；`own` 优先、`participation` 半透明弱化；单条已读（乐观更新）+ 全部已读；「上次检查：N 天前」+ 行内进度条；空态；`artist-updates:changed` 订阅刷新
- [x] 动态条目「🎵」网易云跳转：复用 `App.vue` 详情面板实现与 `v-if` 空值守卫，走既有 `window.api.openExternal`（未新增 IPC）
- [x] **文案校准**：分类展示用「本人名下发行」而非「新作品/新专辑」
- [x] **曲目数与总时长**：`artist_update` 加 `track_count` / `duration_ms`（含守卫式 ALTER 迁移，老库自动补列）；数据来自 `album tracks`（`album get` 实测不含这两个字段，按 `artist songs` 聚合会把合辑误算成单曲）；动态行显示「1 首 · 3:52」/「11 首 · 37:01」，为空时整段不渲染
- [x] **曲目信息自愈**：`hasEntry` 升级为 `entryStatus`（complete / incomplete / missing）——已有但缺曲目信息的行下次检查只补拉 `album tracks` 并 UPDATE，跳过 `album get`；老数据无需手动清库
- [x] **分类启发式调优**：真实关注艺人抽查通过，`classifyArtistUpdate` 规则未作调整
- [x] 更新 `openspec/specs/`：新建 `artist-update-feed/spec.md`；增补 `artist-follow`（`last_checked_at`、级联清理、双 Tab）、`local-storage`（新表）、`ncm-cli-adapter`（`artist songs` 封装与返回结构）
- [x] 归档 change 到 `openspec/changes/archive/` 并同步 `README.md`

## 实现期偏离设计的地方

- **`track_count` 一度被删又加回**：初版实现发现 `album get` 不返回曲目数，删掉了该列；用户反馈需要区分单曲后，改由 `album tracks` 提供并加回 `track_count` + `duration_ms`。代价是每张全新专辑多一次调用。
- **新增 `entryStatus` 三态判断**（替代原 `hasEntry` 布尔）：设计里只写了「已入库跳过」，实现时补上「已收录但信息不完整 → 只补缺的部分」。它同时让「部分失败不推进水位线」的重跑代价可控，以及老数据自愈。
- **`failed` 的语义**：定为「未完全成功的艺人数」。单张专辑详情或曲目拉取失败也会让该艺人计入 failed 且不推进水位线——宁可重跑，不可漏掉。

## 用户侧验证清单

- [x] 关注窗口动态 Tab「立即检查」可触发；未登录时弹登录窗并中止，不发起批量调用
- [x] 检查期间窗口内显示行内进度（当前/总数/艺人名）；重复触发被拒绝并提示正在执行
- [x] **菜单栏「数据」下没有「检查关注艺术家新专辑」项**（入口已收敛到关注窗口）；主窗口不出现该功能的进度条
- [x] **回溯范围下拉**：切换 30 天 / 90 天 / 半年 / 一年后触发，扫描范围随之变化（选更大范围耗时明显更久、发现的条目更多）
- [x] **回溯语义**：某艺人昨天刚检查过，选「最近一年」后仍能扫出这一年内此前未收录的专辑（验证是 `min` 不是 `max`——用 `max` 的话这里什么都扫不出来）
- [x] **首次检查**：耗时在预期区间（90 天约几分钟）；产出条目全部为已读态；已在库的专辑不出现在动态流
- [x] **第二次检查**：同样范围下幂等——无新发行时零新增；重跑不产生重复条目
- [x] **失败收敛**：断网或单艺人失败时，该艺人水位线未推进；恢复后重跑能补齐这段窗口（这条最容易写错，务必实测）
- [x] 分类抽查：随机 10 张 `own` 条目人工核对，确认不是合辑/OST 误判；`participation` 条目确实是参与作品
- [x] 发行日期正确（北京时间，不早一天）
- [x] 关注窗口双 Tab 切换正常；未读数准确；单条已读 / 全部已读即时生效并持久化
- [x] 取关某艺人后，其动态条目一并消失（级联清理）
- [x] 缺加密 ID 的艺人被跳过且完成提示可见（可临时清空某条 `encrypted_id` 构造）
- [x] 封面远程直链正常显示；无网络时回退 💿 占位符不报错
- [x] 「🎵」跳转：点击在系统默认浏览器打开正确的专辑页（非应用内窗口）；`original_id` 缺失时按钮不显示而非报错
- [x] 跳转 → 在网易云收藏 → 回应用手动同步：该专辑进入专辑墙，且下次检查时该条目因「已入库」被跳过
- [x] **曲目数与总时长**：动态行显示「N 首 · m:ss」；单曲显示「1 首」一眼可辨；超过一小时的专辑显示 `h:mm:ss`
- [x] **曲目信息自愈**：本次改动前已产生的动态条目（曲目数为空）在下次检查后被补上，且**不产生重复行**、不重复拉 `album get`
- [x] **合辑不被误算**：找一张该艺人只参与 1-2 首的合辑，确认显示的是**整张专辑的曲目数**而不是该艺人的参与曲目数
- [x] 跨窗口同步：关注/取关后动态 Tab 与关注 Tab 均同步刷新
