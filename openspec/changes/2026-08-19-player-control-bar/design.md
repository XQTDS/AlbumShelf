# 播放控制条 技术设计

## 1. 实测依据（ncm-cli 0.1.6，本机实测）

| 命令 | 返回 | 备注 |
|---|---|---|
| `pause` / `resume` | `{ success: true, message }` | 注意：`pause` 后 `state.status` 变为 `"stopped"`（非 `"paused"`），见 §4 怪癖处理 |
| `next` / `prev` | `{ success, message }` | 队列内切换正常，`state.currentIndex` 与 `title` 随动；边界返回 `success: false` + 文案（"已是最后一首"/"已是第一首，无法上一首"） |
| `seek <秒>` | `{ success: true, message }` | 播放中与暂停态均可跳转（实测暂停态 seek 后 `position` 更新） |
| `state` | `{ success: true, state: { status, title, position, duration, progress, volume, currentIndex, queueLength } }` | `position`/`duration` 为浮点秒；`title` 为合并串 `"晴天 - 周杰伦-"`（艺术家尾部带 `-`）；**无专辑名字段**；空队列时无 `title` 字段；`volume` 恒为 null |
| `volume <0-100>` | `{ success: true, message }` | 越界自动钳位（实测 150→"已设置为 100"、-5→"已设置为 0"）；**无读取命令**（无参报错 missing required argument） |

- `play --song` 会建立仅含该曲的队列（实测 `queueLength: 1`）；`queue add` 追加。
- 每次 `state` 调用是一次 Electron-as-Node 子进程（实测约 300~500ms），轮询频率需克制。

## 2. 主进程扩展

### 2.1 `src/main/ncm-cli-service.ts`

新增方法（均走既有 `executePlayerCmd` 通道）：

```ts
pause(): Promise<void>            // ['pause']
resume(): Promise<void>           // ['resume']
next(): Promise<void>             // ['next']
prev(): Promise<void>             // ['prev']
seek(seconds: number): Promise<void>  // ['seek', String(seconds)]
setVolume(level: number): Promise<void>  // ['volume', String(level)]
getPlaybackState(): Promise<PlaybackState | null>  // ['state']
```

`PlaybackState` 类型：

```ts
export interface PlaybackState {
  status: string          // 'playing' | 'stopped' | 'unknown'
  title: string | null    // 合并串 "歌名 - 艺术家-"，空队列时为 null/缺失
  position: number | null // 浮点秒
  duration: number | null // 浮点秒
  currentIndex: number
  queueLength: number
}
```

实现要点：
- `getPlaybackState` 解析 `executePlayerCmd(['state'])` 返回体的 `state` 字段，逐字段容错（缺失字段给默认值，不因字段缺失抛错）；`state` 命令自身失败时**返回 null**（轮询方降级处理），不抛出——轮询不应因单次失败中断。
- `next`/`prev` 在队列边界返回 `success: false` + message：`executePlayerCmd` 目前会将其当作错误抛出。为保留边界文案，`next`/`prev` 单独捕获 `success: false`，返回 `{ ok: boolean, message: string }` 交由 IPC 层透传，而非抛异常。

### 2.2 `src/main/ipc-handlers.ts`

新增 handler（沿用现有 `player:*` 命名与返回 `{ success, error? }` 惯例）：

| channel | 入参 | 返回 |
|---|---|---|
| `player:pause` | — | `{ success, error? }` |
| `player:resume` | — | `{ success, error? }` |
| `player:next` | — | `{ success, error?, boundary?: true, message? }`（边界时 `success: false` 但非异常） |
| `player:prev` | — | 同上 |
| `player:seek` | `seconds: number` | `{ success, error? }` |
| `player:volume` | `level: number`（0-100） | `{ success, error? }` |
| `player:state` | — | `{ success, data?: PlaybackState }`（失败返回 `success: false`，不抛） |
| `player:stop` | — | `{ success, error? }`（`queueClear()`，播放条关闭按钮用） |

- 播放命令遇 `NcmLoginRequiredError` 沿用现有 `authService.handleLoginRequiredError` 弹登录框模式。
- `player:seek` 校验 `seconds` 为有限非负数；`player:volume` 校验为有限数值且钳位到 [0, 100]（ncm-cli 自身也钳位，此处前置校验保证日志与行为可预期）。

### 2.3 `src/preload/index.ts` + `index.d.ts`

按既有命名暴露：`playerPause / playerResume / playerNext / playerPrev / playerSeek(seconds) / playerSetVolume(level) / playerState / playerStop`。

## 3. 渲染层设计（App.vue + 新组件 PlayerBar.vue）

### 3.1 播放上下文状态（App.vue）

```ts
interface QueueTrackSnapshot { trackId: number; title: string; artist: string }

const nowPlaying = ref<{
  albumTitle: string
  albumArtist: string
  coverUrl: string | null
  trackTitle: string
  trackArtist: string
  queue: QueueTrackSnapshot[]   // 本地队列快照（发起播放时构建）
} | null>(null)

const playback = reactive({
  status: 'stopped' | 'playing' | 'paused' | 'unknown',
  position: 0,      // 上次 state 锚点（秒）
  duration: 0,
  currentIndex: 0,
})
```

- **发起播放时**（`handlePlayAlbum` / `handlePlayTrack` 成功后）：写入 `nowPlaying`（含队列快照：专辑模式 = playable 曲目数组；单曲模式 = 单元素），启动轮询。
- **轮询**（`setInterval` 自适应，用 `window.api.playerState()` invoke）：
  - `status === 'playing'` → 1s 间隔；`paused` → 3s；`stopped` 且 `queueLength === 0` → 停止轮询并清空 `nowPlaying`（播放条隐藏）。
  - 每次拿到 `position` 更新锚点；`status` 为 `'playing'` 时用 `performance.now()` 在锚点上插值出平滑进度（渲染层 computed）。
  - 用 `state.title` 兜底更新 `trackTitle/trackArtist`（按最后一个 `" - "` 切分，剥离艺术家尾部 `-` 怪癖）；`currentIndex` 变化时优先用本地队列快照 `queue[currentIndex]` 更新标题/艺术家。
  - 单次 `player:state` 失败：保留上次状态继续轮询，不报错。
- **暂停怪癖处理**（§4）：`player:pause` 成功后本地置 `status = 'paused'`（不再等 state 确认）；`player:resume` 成功后本地置 `playing` 并立刻把轮询间隔调回 1s。`state.status === 'stopped'` 且 `queueLength > 0` 时以本地 `status` 为准显示暂停态，不误判为停止。

### 3.2 进度条交互

- 进度条 = 可点击轨道：`click → 比例 × duration → playerSeek(秒)`；拖动时（`pointerdown` 后到 `pointerup`）组件本地预览拖动位置（显示以拖动值优先），释放时按最终比例 seek；跳转后 2 秒宽限期内忽略轮询携带的旧 position 回写（进行中的轮询晚到会令进度回跳），避免回跳闪动。
- 时间显示：已播/总时长均 `m:ss` 格式化（复用/抽取 App.vue 既有 `formatDuration` 逻辑）。
- seek 失败 → `showMessage(..., 'error')`，进度条回退到锚点。

### 3.3 next/prev 交互

- 点击 → `playerNext()`/`playerPrev()`：成功后 `currentIndex` 由下一轮 state 回填，标题/艺术家按队列快照更新（外部播放会话无快照时退回 state.title 解析）。
- 边界返回 `{ boundary: true, message }` → `showMessage(message, 'info')`，按钮不禁用（保持可点，依赖提示反馈）。

### 3.4 PlayerBar 组件（`src/renderer/src/PlayerBar.vue`）

- 位置：`.app` 布局（flex column）底部、主内容区与详情面板之下，`v-if="nowPlaying"` 控制显隐；`position: sticky/fixed` 于窗口底部，不随滚动。
- 结构（左→右）：封面缩略图（复用 `cover://album/{id}` 协议，40px）｜歌曲名·艺术家（主行）+ 专辑名（副行，`—` 兜底）｜`⏮` `▶/⏸`（按 playback.status）`⏭`｜已播时间｜进度条（flex: 1，可点可拖）｜总时长｜音量控制（图标 + 窄滑块，§3.6）｜`✕` 关闭按钮（`playerStop` + 隐藏播放条）。
- 样式沿用 `:root` 现有 CSS 变量（`--surface`、`--border`、`--primary`、`--radius`、`--shadow`），不引入新配色。
- 播放按钮图标态：`playing` → `⏸`（title="暂停"）；`paused/stopped/unknown` → `▶`（title="播放"，点击走 `playerResume`；`stopped` 且无队列时条已隐藏，不出现此态）。

### 3.5 与既有播放流程的衔接

- `handlePlayAlbum` 成功后即写队列快照（`playable` 曲目数组），`handlePlayTrack` 写单元素快照——均在 invoke 返回后一次性完成，不改动主进程 `player:playAlbum` 的清队→首曲→入队流程。
- 应用退出停止播放（既有 `stopPlaybackOnQuit`）不变；播放条隐藏状态与其无耦合。

### 3.6 音量控制

- **音量状态由应用本地管理**（ncm-cli 无音量读取命令，`state.volume` 恒为 null，见 §1）：App.vue 持 `volume` ref（0-100，默认 100，`localStorage` key `player-volume` 持久化），另有 `lastNonZeroVolume` 供静音恢复。
- **播放会话启动时应用**：`beginPlaybackContext()` 内以 fire-and-forget 调用 `playerSetVolume(volume.value)`，保证后端音量与 UI 一致（后端可能被外部修改过，如终端 ncm-cli）。
- **滑块交互**：窄滑块（约 80px）本地拖拽预览（与进度条同一 pointer 模式），释放时 emit `volume` → App 调 `playerSetVolume`；拖动过程中不向主进程发命令（避免每次 mousemove 都起一个 Electron-as-Node 子进程）。
- **图标静音切换**：点击图标在 0 ↔ `lastNonZeroVolume` 间切换（图标态按当前音量选 🔇/🔈/🔉/🔊）；`playerSetVolume` 失败 → toast 提示并回滚 UI。
- **不读取后端音量**：UI 是唯一事实源，外部修改音量不与 UI 同步（提案非目标）。

## 4. 边界与怪癖清单

| 情形 | 处理 |
|---|---|
| `pause` 后 `state.status === 'stopped'` | 本地 `status` 字段为权威（用户动作驱动），state 仅用于 `position/duration/currentIndex/queueLength` 与外部状态探测 |
| `state.title` 艺术家尾部 `-`（"周杰伦-"） | 解析时 `trim` 并剥离尾部 `-` |
| `next`/`prev` 边界 `success: false` | 透传 message 作 info 提示，不当错误弹窗 |
| `state` 空队列无 `title` 字段 | `title: null`，UI 用本地快照，无快照则不显示播放条 |
| 单曲播放后 next/prev | 队列仅 1 首，必然触发边界提示（预期行为） |
| 外部启动的播放（终端 ncm-cli） | 本地无快照：播放条显示 state.title 解析出的歌名/艺术家，专辑名「—」，next/prev 不可预知（仍可用） |
| seek 秒数非法 | IPC 层校验有限非负数，直接拒绝 |
| `volume` 越界 | ncm-cli 自动钳位到 [0,100]；IPC 层前置钳位 |
| 后端音量被外部修改 | 无读取渠道，不检测；仅在下个播放会话启动时重新应用本地音量 |
| 轮询中命令超时/失败 | 保留上次状态，间隔不变，静默重试 |

## 5. 性能

- 轮询成本：1s/次 × 单子进程约 300~500ms，仅播放中维持；暂停态 3s/次；停止即停。窗口失焦（`document.hidden`）时可选放宽到 2s——作为可选优化，不在首版实现。
