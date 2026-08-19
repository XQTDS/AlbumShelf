# 一键播放专辑即时反馈 技术设计

## 1. 现状与根因

`player:playAlbum`（[ipc-handlers.ts:594-651](../album-shelf/src/main/ipc-handlers.ts#L594-L651)）串行执行并全部 await 后才返回：

```
queueClear()        → 1 次子进程（~0.4-1s）
playSong(第一首)     → 1 次子进程     ← 声音从这里开始，所以"马上有声音"
waitForPlaying()    → 先 setTimeout(1000)，再每 1000ms 轮询 state（每次 1 次子进程）
queueAdd(第 2..N 首) → (N-1) 次串行子进程，每次还调一次取播放地址 API（实测 ~1s/首）
return              → 渲染层才 beginPlaybackContext → nowPlaying 赋值 → 播放条出现
```

播放条出现时刻 ≈ 队列建完时刻 ≈ 8-12 秒（12 首专辑）。

## 2. 改动一：`player:playAlbum` 两段式 + 后台补队列（ipc-handlers.ts）

主进程模块级新增代际计数器：

```ts
// 播放会话代际：新一轮 player:playAlbum / player:stop 使上一轮未完成的
// 后台补队列任务失效（代际不匹配即中止），避免旧任务污染新队列
let playQueueGeneration = 0
```

handler 重构为两段：

```ts
ipcMain.handle('player:playAlbum', async (_event, albumId: number) => {
  // …曲目获取/过滤不变…
  const generation = ++playQueueGeneration   // 使旧后台任务失效

  // 阶段一（阻塞返回路径）：清队列 → 播首曲 → 确认播放
  await ncmCliService.queueClear()
  await ncmCliService.playSong(playable[0].netease_song_id!, playable[0].netease_original_id!)
  const success = await ncmCliService.waitForPlaying()
  if (!success) {
    return { success: false, error: '播放失败' }
  }

  // 阶段二（后台，不阻塞返回）：剩余曲目串行补入
  void fillQueueInBackground(generation, playable.slice(1))

  return { success: true, data: { playing: playable[0].title, totalTracks: playable.length } }
})
```

后台补队列函数（模块级）：

```ts
/**
 * 后台将剩余曲目串行加入队列（不阻塞 player:playAlbum 返回）
 * 每次 queueAdd = 1 次子进程 + 1 次取址 API（约 1s/首），放后台避免阻塞播放条出现
 */
async function fillQueueInBackground(
  generation: number,
  tracks: { netease_song_id: string; netease_original_id: number; title: string }[]
): Promise<void> {
  for (const track of tracks) {
    if (generation !== playQueueGeneration) return  // 已被新一轮播放/停止取代
    try {
      await ncmCliService.queueAdd(track.netease_song_id, track.netease_original_id)
    } catch (error) {
      // 单首失败不中止后续；登录失效等仅记录日志不弹窗（播放已开始，不打断用户）
      console.error(`[playAlbum] 后台补队列失败: ${track.title}:`, error)
    }
  }
}
```

## 3. 改动二：`waitForPlaying` 提速（ncm-cli-service.ts）

现状（[ncm-cli-service.ts:703-718](../album-shelf/src/main/ncm-cli-service.ts#L703-L718)）：先睡 1000ms 再轮询、间隔 1000ms，最顺利也要 ~1.4-2s。

改为：首查前仅延迟 200ms（给播放后端启动留缓冲），轮询间隔 300ms，总超时保持 5s：

```ts
async waitForPlaying(maxWaitMs = 5_000, intervalMs = 300, firstDelayMs = 200): Promise<boolean> {
  const start = Date.now()
  await new Promise((resolve) => setTimeout(resolve, firstDelayMs))
  while (Date.now() - start < maxWaitMs) {
    try {
      const state = await this.getState()
      if (state.status === 'playing') {
        return true
      }
    } catch {
      // 查询失败继续重试
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  console.warn('[ncm-cli] 等待播放超时')
  return false
}
```

预期最顺利路径 ~0.6-0.9s（0.2s 首延迟 + 1-2 次子进程），最坏仍 5s 兜底。

## 4. 改动三：`player:stop` 失效后台任务（ipc-handlers.ts）

停止播放时先 bump 代际再清队列，保证在途的补队列任务在下一首前中止，清空后的队列不被旧任务重新填充：

```ts
ipcMain.handle('player:stop', async () => {
  playQueueGeneration++   // 先失效后台补队列，再清队列
  return runPlayerCommand(() => ncmCliService.queueClear())
})
```

## 5. 竞态与边界分析

- **新一轮播放覆盖旧任务**：`player:playAlbum` 开头 `++playQueueGeneration`，旧后台任务在下一首前检查代际不符即返回，不会把旧专辑曲目写进新队列
- **stop 与在途 queueAdd**：bump 在 clear 之前；已在途（子进程已启动）的一首会先完成，随后 clear 清空，最终队列为空；bump 保证后续曲目不再补入
- **后台补队列失败**：单首失败（含登录失效）仅记录日志并继续后续曲目；不弹登录窗——播放已开始，弹窗打断收听得不偿失。极端情况下（登录中途失效）队列补不全，用户按 next 到边界会收到既有边界提示，属可接受降级
- **渲染层会话存活判定**：`beginPlaybackContext` 后首轮轮询即可观察到 `queueLength ≥ 1`（首曲已入队），`playerSessionSeenActive` 守卫不受影响；队列长度随后台补入增长，现有轮询逻辑无依赖
- **渲染层防重入**：`playingAlbumId` 守卫不变，UI 侧不会并发发起两次 playAlbum；主进程代际守卫兜底
- **`player:playSong`（单曲播放）不 bump 代际**：其语义为"不修改队列"，若后台补队列仍在进行，继续补完队列与既有行为一致

## 6. 不改动的部分

- 渲染层 `handlePlayAlbum` / `beginPlaybackContext` / `PlayerBar` 全部不变（`result.data` 协议不变）
- `queueAdd` / `queueClear` / `playSong` 的 ncm-cli 封装不变
- 不并行 `queueAdd`（见 proposal 非目标：CLI 单曲限制 + `queue.json` 竞态）
