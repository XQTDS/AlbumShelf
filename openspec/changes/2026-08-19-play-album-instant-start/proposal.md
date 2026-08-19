# 一键播放专辑即时反馈与后台补队列

## 背景

一键播放整张专辑时，用户点击后几乎立即听到第一首歌的声音，但底部播放栏要等很久才出现，且所有曲目入队也要很久。

实测定位（用户机器，2026-08-19）：

- `player:playAlbum`（`src/main/ipc-handlers.ts`）把整条链路串行做完才返回：清队列 → 播首曲 → `waitForPlaying`（先睡 1 秒再每秒轮询 `state`）→ 剩余 N-1 首逐首 `queueAdd`
- 每次 ncm-cli 调用 = 启动一个 Electron 子进程（实测 ~400ms）+ 命令内部开销；`queue add` 每次还会调一次网易云取播放地址 API（`song/detail/get/v2`，实测约 1 秒/首，用户本地 `~/.config/ncm-cli/app.log` 可证）
- 渲染层 `handlePlayAlbum` 等 `player:playAlbum` 返回后才 `beginPlaybackContext`，而播放条 `v-if="nowPlaying"` 由它驱动

因此 12 首歌的专辑：播放条出现要等约 8-12 秒（与队列建完同刻），期间声音早已响起。

## 目标

- 点击播放后播放条在约 2 秒内出现：主进程在「清队列 → 播首曲 → 确认开始播放」后立即返回，不再等待全部曲目入队
- 剩余曲目在主进程后台串行补入队列，不阻塞 IPC 返回，不改变 UI 任何逻辑
- 新一轮播放或停止播放时，上一轮未完成的后台补队列立即中止，避免污染新队列

## 非目标

- 不并行 `queueAdd`：ncm-cli `queue add` 一次只接受一首歌（无批量参数），且队列状态持久化在 `~/.config/ncm-cli/queue.json`，多进程并发读改写会丢条目
- 不改变每首一次的取址 API 频率（ncm-cli 内部行为），队列补入速度维持约 1 秒/首，但不再阻塞任何 UI
- 不改渲染层播放入口与播放条展示逻辑（`beginPlaybackContext` 已用本地曲目构建完整队列快照，与后台补队列时机无关）
- 不引入 ncm-cli 常驻进程复用等大改造
