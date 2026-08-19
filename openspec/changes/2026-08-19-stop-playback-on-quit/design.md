# 技术方案

## 1. 停止播放函数

- `src/main/ipc-handlers.ts` 新增导出 `stopPlaybackOnQuit(): Promise<void>`：
  1. 调用 `ncmCliService.getState()`（`ncm-cli state`，本地查询播放器守护进程，实测空闲时返回 `{ success: true, state: { status: 'stopped', ... } }`）
  2. `status` 为 `'playing'` 或 `'paused'` 时调用 `ncmCliService.queueClear()`（`ncm-cli queue clear`，实测空闲时幂等返回「队列已清空，播放已停止」）
  3. 任何失败仅记录日志，不抛出——退出流程不得因播放器异常而中断
- 复用在 `ipc-handlers.ts` 模块内的 `ncmCliService` 单例，不新建实例；`index.ts` 通过 import 直接调用，无需新增 IPC 通道

## 2. 退出流程接入

`src/main/index.ts` 的 `before-quit` 改造：

- 新增模块级 `quitCleanupDone` 标志：`before-quit` 首次触发时 `event.preventDefault()` 并置位，避免清理过程中重复触发 `preventDefault` 造成退出死循环
- 以 `Promise.race` 将 `stopPlaybackOnQuit()` 与 5 秒兜底定时器赛跑（`ncm-cli` 单命令自身有 15s execFile 超时，`state` + `queue clear` 理论最坏 30s；本地查询通常 < 1s，5s 上限在兜住异常的同时把退出延迟控制在可接受范围）
- `finally` 中执行 `closeDatabase()` 后再次 `app.quit()`：第二次触发 `before-quit` 时标志已置位，直接放行（`closeDatabase` 只执行一次）
- 原有「`before-quit` 直接 `closeDatabase()`」逻辑被上述流程取代

## 3. 状态取值

- `'playing'`：正在播放，必须停止（本次缺陷场景）
- `'paused'`：暂停但播放器进程仍存活，一并清理（退出即结束播放会话）
- `'stopped'` / `'unknown'`：无播放活动，不做任何操作

## 4. 涉及文件

- `src/main/ipc-handlers.ts`：新增导出 `stopPlaybackOnQuit()`
- `src/main/index.ts`：import 并在 `before-quit` 中接入限时清理流程
- preload / 渲染层无需改动

## 5. Spec 更新

- 新增 `openspec/specs/playback/spec.md`：播放能力首个 spec，包含「退出时停止播放」Requirement
