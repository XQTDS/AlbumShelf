# 2026-08-21-sync-progress-bar 技术方案

## 现状

同步调用链：`ipcMain.handle('sync:start')` → `SyncManager.sync()` → `NcmCliSyncService.fetchCollectedAlbums()`（每页 50 张，翻页直到空页），随后同步循环去重写入、批量删除。整条链路同步执行，仅 `handleSync` 在渲染层显示静态提示。

进度条先例：补全/封面/发行日期回填均通过 `event.sender.send('<channel>:progress', ...)` 推送进度，渲染层注册监听后填充 `enrich-bar` 样式进度条（模板 + `.enrich-progress-track/-fill` CSS 复用）。

## 方案

### 进度数据形状

新增 `SyncProgress` 接口（定义于 `sync-manager.ts` 并导出）：

```ts
export interface SyncProgress {
  /** 当前阶段：fetching（拉取收藏列表，总数未知）/ writing（写入数据库，总数已知） */
  phase: 'fetching' | 'writing'
  /** 已处理数量：fetching 阶段为已拉取张数；writing 阶段为已检查写入张数 */
  current: number
  /** 专辑总数：fetching 阶段为 null（未知）；writing 阶段为拉取到的总数 */
  total: number | null
}
```

### 主进程改造

1. `SyncService.fetchCollectedAlbums(onProgress?: (fetched: number) => void)`：接口签名加可选回调，`NcmCliSyncService` 每拉完一页调用一次（约 1 秒一次事件，频次天然受网络限流）。
2. `SyncManager.sync(onProgress?: (progress: SyncProgress) => void)`：
   - fetching 阶段转发 `{ phase: 'fetching', current: 已拉取张数, total: null }`
   - 拉取完成后推一次 `{ phase: 'writing', current: 0, total: N }`（进度条切换为定长模式）
   - 写入循环内每处理满 50 张（一页粒度）推一次，循环结束后推 `{ phase: 'writing', current: N, total: N }`。写入循环是同步的本地 SQLite 去重检查，按页粒度节流避免数百张专辑瞬间打几百个 IPC 事件。
3. `sync:start` handler 改为接收 `event`，通过 `event.sender.send('sync:progress', progress)` 推送（发送前判 `isDestroyed()`，与现有 enrich 推送一致）。

### 渲染层改造

1. `preload/index.ts` 暴露 `onSyncProgress(callback)`，`index.d.ts` 补充 `SyncProgress` 接口与 `AlbumShelfAPI` 成员。
2. `App.vue`：
   - 新增 `syncProgress` ref 与 `setupSyncProgressListener()`，`onMounted` 注册
   - 模板在补全进度条上方新增同步进度条（复用 `enrich-bar` / `enrich-progress-track` 类）：
     - fetching：文案「正在获取收藏专辑列表…已获取 X 张」，fill 使用不定长平移动画（新增 `.sync-progress-indeterminate` + `@keyframes`）
     - writing：文案「正在同步专辑 X/Y 张」，fill 宽度按 `current / total` 百分比
   - `handleSync` 的 `finally` 中清除 `syncProgress`（成功、失败、异常统一清理；最终统计消息仍由既有 `showMessage` 展示）

## 边界情况

- 拉取中途失败：主进程抛错中止（不执行删除），handler 返回 `success: false`，`handleSync` 提示错误并清除进度条。
- 同步完成后自动补全（`result.added > 0`）异步触发 `enrichAll`：同步进度条在 invoke 返回时已清除，随后补全进度条独立显示，二者不冲突。
- 重复触发：`SyncManager.isSyncing` 防重入已有；进度事件只会出现在一次合法同步期间，监听器无需防串扰。

## 非方案

- 不采用 ncm-cli 返回的 `recordCount` 作为总数（实测恒为 0，见 data-sync spec）。
- 不为删除阶段单独分阶段：删除为单次批量 SQL，耗时可忽略。
