# 设计：模糊匹配确认非阻塞队列

## 现状

`EnrichService.enrichAlbum` 串行执行：精确匹配 → 失败则模糊查询 →
`await onFuzzyMatch(...)` 阻塞等待用户回复。

`onFuzzyMatch` 由 `ipc-handlers.ts` 的 `createFuzzyMatchCallback` 实现：
发送 `enrich:fuzzy-confirm-request` 后挂起在 `ipcMain.once('enrich:fuzzy-confirm-reply')` 上。
批量循环因此被逐张专辑的用户操作打断。

## 方案

队列放在主进程（ipc-handlers.ts 模块级内存队列），
渲染层弹窗保持单例、无需引入队列状态。

### 数据流

```
批量循环 ──精确匹配失败──▶ 入队（不等待）──▶ 继续下一张
                              │
                              ▼
              队列消费器（串行）：取队首 → 弹窗等待回复
                              │
                              ▼ 用户回复 / 窗口销毁
              confirmFuzzyMatch：确认→lookup+写库 / 跳过→标记 enriched_at
                              │
                              ▼
              enrich:fuzzy-resolved 事件 → 渲染层刷新列表
```

### 变更点

1. **`OnFuzzyMatchCallback` 契约**：由 `Promise<reply>` 改为 `void`——调用即入队，不等待回复。
2. **`enrichAlbum` 三态返回**：`'matched' | 'failed' | 'pending'`。
   精确匹配失败且存在回调时，入队后立即返回 `pending`，**不标记 `enriched_at`**
   （该专辑仍处于"未补全"状态，用户回复时由 `confirmFuzzyMatch` 结算）。
3. **新增 `EnrichService.confirmFuzzyMatch(album, candidates, reply)`**：
   - 确认 → 复用现有私有方法 `processConfirmedMatch`（lookup 详情、写库、自动学习别名）
   - 跳过或处理失败 → 标记 `enriched_at` 避免重复尝试
4. **ipc-handlers.ts 新增队列消费器 `drainFuzzyConfirmQueue`**：
   - 串行处理：取队首 → 弹窗等待回复 → 调 `confirmFuzzyMatch` → 发 `enrich:fuzzy-resolved` 通知
   - `fuzzyDialogDraining` 标志保证同一时刻只有一个消费器（即最多一个弹窗）
5. **弹窗请求 payload 增加 `pendingCount`**：队列中剩余的待确认数量，弹窗内展示。
6. **新增 `enrich:fuzzy-resolved` 事件**：用户回复并写库后通知渲染层刷新列表与风格统计，
   并提示确认结果。

## 关键决策

- **队列放主进程而非渲染层**：渲染层弹窗是单例组件，主进程串行弹窗天然满足
  "依次弹出"，渲染层无需引入队列状态；回复通道无需 requestId 关联
  （同一时刻只有一个在途弹窗）。
- **pending 不标记 enriched_at**：用户确认前该专辑仍可被下次补全重新尝试；
  应用重启未回复的队列项自然丢弃，下次补全重新入队，无状态丢失。
- **窗口销毁保护**：弹窗等待期间窗口销毁时，消费器以"跳过"结算并清空后续队列，
  避免 Promise 悬挂。
- **`EnrichResult.confirmed` → `pending`**：批量结果统计改为 `pending`（等待确认数）；
  确认结果通过 `enrich:fuzzy-resolved` 异步反馈，不再计入批量统计。
- **候选为空的专辑同样入队**：保留手动粘贴 MB 链接的入口，行为与现状一致。

## 边界情况

- 批量扫描结束但队列仍有待确认项：弹窗继续依次弹出，确认结果异步写库，
  不受扫描结束影响。
- 上一次批量的队列未清空时又触发新批量：旧队列项仍会弹出（弹窗显示旧专辑），
  确认后正常写库；`enriching` 互斥锁防止批量并发。
- 单张专辑重新同步（album:resync）：同样走队列；`enrich_matched` 仅反映精确匹配结果，
  渲染层当前未消费该字段，确认结果经 `enrich:fuzzy-resolved` 触发刷新。
