# 专辑和单曲播放功能

## 概述
通过 ncm-cli 实现专辑播放和单曲播放功能。专辑播放时将全部曲目加入播放列表；单曲播放时直接播放选中歌曲。

## 变更范围

### 新增 — NcmCliService 播放控制方法
- `executePlayerCmd()` — 处理播放控制命令的 `{ success, message }` 返回格式（区别于数据查询的 `{ code, data }`）
- `queueClear()` — 清空播放队列（`ncm-cli queue clear`）
- `playSong()` — 播放单曲（`ncm-cli play --song`）
- `queueAdd()` — 加入队列（`ncm-cli queue add`）
- `getState()` — 查询播放状态（`ncm-cli state`）
- `waitForPlaying()` — 轮询等待播放状态变为 playing（最多 10 秒，500ms 间隔）

### 新增 — IPC Handlers
- `player:playAlbum` — 播放整张专辑：清空队列 → 播放第一首 → 等待播放开始 → 依次加入剩余曲目
- `player:playSong` — 播放单曲：直接调用 `playSong()`，不修改队列

### 新增 — Preload API
- `playerPlayAlbum(albumId)` — 播放专辑
- `playerPlaySong(encryptedId, originalId)` — 播放单曲

### 新增 — 前端 UI
- 专辑行标题旁 ▶ 圆形播放按钮（紫色实心，hover 放大）
- 曲目行左侧 ▶ 播放按钮（默认隐藏，hover 行时显示）
- `handlePlayAlbum()` / `handlePlayTrack()` 函数
- `playingAlbumId` / `playingTrackId` loading 状态

### 新增 — 调试日志
- `execute()` 和 `executePlayerCmd()` 输出完整命令和 stdout/stderr 到主进程终端

### 关键设计决策
1. **两种返回格式**：ncm-cli 数据查询返回 `{ code, data }`，播放控制返回 `{ success, message }`，分别用 `execute()` 和 `executePlayerCmd()` 处理
2. **等待播放开始**：play 命令发出后需等待播放器状态变为 `playing` 再执行 queue add，否则会中断播放
3. **单曲直接播放**：不修改播放队列，避免干扰当前播放列表
4. **无 JSON 返回兼容**：命令可能不返回 JSON，此时 execute 返回 null，executePlayerCmd 视为成功

## 涉及文件
- `album-shelf/src/main/ncm-cli-service.ts`
- `album-shelf/src/main/ipc-handlers.ts`
- `album-shelf/src/preload/index.ts`
- `album-shelf/src/preload/index.d.ts`
- `album-shelf/src/renderer/src/App.vue`
