# 任务清单

## 实现

- [x] 新增 `openspec/changes/2026-08-17-cover-local-cache/` 变更文档（proposal/design/tasks）
- [x] 新增 `src/main/cover-cache.ts`：缓存目录与路径计算（`<albumId>_<hash>.<ext>`）、`registerSchemesAsPrivileged` 模块顶层注册、`registerCoverProtocol()`（缓存命中读盘 / 未命中 15s 超时下载写盘 / 失败 404）、同专辑下载去重、旧缓存文件清理
- [x] `src/main/album-service.ts`：新增 `getCoverUrlById(id)` 轻量单列查询
- [x] `src/main/index.ts`：import cover-cache、whenReady 中调用 `registerCoverProtocol()`、CSP `img-src` 增加 `cover:`
- [x] `src/renderer/src/App.vue`：新增 `coverSrc()` 与 `coverProtocolFailed` 状态；`onCoverError` 改为「协议失败 → 远程 URL → 占位+补全」三级回退；两处封面 `<img>` 的 `:src` 改用 `coverSrc()`
- [x] 更新 `openspec/specs/local-storage/spec.md` 新增「封面图片本地缓存」Requirement

## 收尾

- [x] 用户手动 `npm run dev` QA：首次打开列表封面正常显示且 `userData/covers/` 出现缓存文件；断网重启后已缓存封面仍显示、未缓存封面回退占位；补全封面后新 URL 生成新缓存文件
- [x] 归档 change 到 `openspec/changes/archive/`
