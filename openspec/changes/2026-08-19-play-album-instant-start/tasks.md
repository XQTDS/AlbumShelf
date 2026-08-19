# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-08-19-play-album-instant-start/` 变更文档（proposal/design/tasks）

## 主进程

- [x] `src/main/ipc-handlers.ts`：
  - 模块级新增 `playQueueGeneration` 代际计数器
  - 重构 `player:playAlbum`：清队列 → 播首曲 → 确认播放后立即返回；剩余曲目交后台 `fillQueueInBackground` 串行补入（fire-and-forget）
  - 新增 `fillQueueInBackground`：每首前检查代际（不符即中止）、单首失败仅记日志继续后续
  - `player:stop` 开头 bump 代际，失效在途的后台补队列
- [x] `src/main/ncm-cli-service.ts`：
  - `waitForPlaying` 提速：首查延迟 200ms、轮询间隔 300ms（总超时保持 5s）

## 收尾

- [x] 更新 `openspec/specs/playback/spec.md`：新增「专辑播放即时反馈与后台补队列」Requirement
- [x] 同步 `README.md`（内置播放条目补充"播放条秒出、后台补队列"说明）
- [ ] 用户手动 `npm run dev` QA：
  - 一键播放专辑：点击后 ~2s 内播放条出现且信息正确，声音立即响起
  - 等待数秒后 `next` 可逐首切歌到专辑末曲（后台补队列完成）
  - 补队列进行中点「停止」：队列清空、播放停止、播放条隐藏，不再有旧专辑歌曲被补入（可观察 `~/.config/ncm-cli/queue.json` 保持空）
  - 补队列进行中切换播放另一张专辑：新专辑正常从头播放，队列最终只含新专辑曲目
  - 播放单曲（详情面板逐曲播放）行为不回退
- [ ] QA 通过后归档 change 到 `openspec/changes/archive/`
