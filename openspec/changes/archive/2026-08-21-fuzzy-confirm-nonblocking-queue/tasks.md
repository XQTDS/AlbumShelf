# 任务清单

- [ ] `enrich-service.ts`：`OnFuzzyMatchCallback` 改为 void；`enrichAlbum` 返回三态并新增 `pending` 分支；新增公开方法 `confirmFuzzyMatch`；三个批量方法统计 `pending`、移除 `confirmed` 计数包装；`EnrichResult` 以 `pending` 替换 `confirmed`
- [ ] `ipc-handlers.ts`：模块级待确认队列 + 串行弹窗消费器 `drainFuzzyConfirmQueue`；弹窗 payload 增加 `pendingCount`；新增 `enrich:fuzzy-resolved` 通知；窗口销毁保护（等待期间窗口销毁自动跳过）
- [ ] `preload/index.ts`、`preload/index.d.ts`：暴露 `onFuzzyResolved`；更新 `EnrichResult`（pending）、`FuzzyConfirmRequest`（pendingCount、coverUrl）类型
- [ ] `FuzzyMatchModal.vue`：展示队列剩余待确认数量
- [ ] `App.vue`：监听 `enrich:fuzzy-resolved` 刷新列表与风格统计；批量完成提示包含待确认数量
- [ ] 更新 `openspec/specs/fuzzy-match-confirm`、`openspec/specs/data-enrichment` 中阻塞相关的行为描述
- [ ] 同步 README 中模糊匹配人工确认的功能说明
