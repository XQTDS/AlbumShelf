# 任务清单

## 实现

- [x] 新增 `openspec/changes/2026-08-19-stop-playback-on-quit/` 变更文档（proposal/design/tasks）
- [x] `src/main/ipc-handlers.ts`：新增导出 `stopPlaybackOnQuit()`（查状态 → playing/paused 时 `queueClear()`，失败仅记日志）
- [x] `src/main/index.ts`：`before-quit` 接入限时清理流程（`preventDefault` + 5s 兜底 + `closeDatabase()` 后再次 `quit()`）
- [x] 新增 `openspec/specs/playback/spec.md`：「退出时停止播放」Requirement

## 收尾

- [x] 用户手动 `npm run dev` QA：播放曲目后关闭窗口，音乐立即停止且退出无卡顿；未播放时退出行为与之前一致
- [x] 归档 change 到 `openspec/changes/archive/`
