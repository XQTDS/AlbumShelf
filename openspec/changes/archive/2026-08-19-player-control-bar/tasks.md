# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-08-19-player-control-bar/` 变更文档（proposal/design/tasks）

## 主进程

- [x] `src/main/ncm-cli-service.ts`：新增 `PlaybackState` 类型与 `pause / resume / next / prev / seek / setVolume / getPlaybackState` 方法（next/prev 捕获边界 `success: false` 返回 `{ ok, message }`；getPlaybackState 字段容错、失败返回 null 不抛）
- [x] `src/main/ipc-handlers.ts`：新增 `player:pause / resume / next / prev / seek / volume / state / stop` handler（seek 校验有限非负数；volume 校验有限数值并钳位到 [0,100]；next/prev 边界透传 message；state 失败返回 `success: false` 不抛；登录态错误沿用 `handleLoginRequiredError`）
- [x] `src/main/ipc-handlers.ts`：`stopPlaybackOnQuit` 修复暂停会话漏清理（ncm-cli pause 后 state.status 为 'stopped'，改以 `queueLength > 0` 判定会话存活）
- [x] `src/preload/index.ts` + `src/preload/index.d.ts`：暴露 `playerPause / playerResume / playerNext / playerPrev / playerSeek / playerSetVolume / playerState / playerStop`

## 渲染层

- [x] `src/renderer/src/PlayerBar.vue`：新增底部播放条组件（封面/歌曲·艺术家/专辑名、⏮ ▶/⏸ ⏭、已播时间/可点可拖进度条/总时长、音量图标+窄滑块、✕ 停止按钮），样式沿用现有 CSS 变量
- [x] `src/renderer/src/App.vue`：
  - 播放上下文状态（`nowPlaying` + `playback` reactive）与队列快照构建（handlePlayAlbum/handlePlayTrack 成功后写入）
  - 自适应轮询（playing 1s / paused 3s / 停止即停）+ 锚点插值平滑进度（rAF 心跳）+ 拖动暂停锚点更新
  - 会话存活确认标志（规避播放启动瞬间 queueLength 0 误杀播放条）
  - 接入 PlayerBar（`.app` 布局底部，`v-if="nowPlaying"`）
  - 暂停/恢复的本地状态权威处理（state.status 'stopped' 怪癖）、next/prev 边界提示、state.title 兜底解析
  - 音量状态（localStorage 持久化、默认 100）、播放会话启动时应用到后端、静音切换（0 ↔ lastNonZeroVolume）与失败回滚

## 收尾

- [x] 更新 `openspec/specs/playback/spec.md`：新增「播放控制与状态展示」Requirement 与「音量控制」Requirement；修正「暂停中退出」场景（queueLength 判定）
- [x] 同步 `README.md`（功能特性新增「内置播放」条目）
- [x] 用户手动 `npm run dev` QA：
  - 播放专辑 → 播放条出现，显示专辑名/歌曲名/艺术家/封面
  - 暂停/恢复：图标切换正确，暂停后进度不再前进
  - 上一首/下一首：曲目信息随切换更新；单曲播放时点下一首有边界提示
  - 进度条：时间随播放前进，点击/拖动跳转后播放位置正确（含暂停态跳转）
  - 音量滑块：拖动后音量立即生效且图标随音量变化；点击图标静音/恢复；重启应用后音量记忆生效；新播放会话开始时音量应用到后端
  - 播放条 ✕ → 播放停止、播放条隐藏
  - 播放中退出应用 → 音乐立即停止（既有行为不回退）
  - 暂停状态退出应用 → 音乐同样停止（本次修复的漏清理场景）
- [x] QA 通过后归档 change 到 `openspec/changes/archive/`
