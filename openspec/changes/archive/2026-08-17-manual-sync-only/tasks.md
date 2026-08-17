# 任务清单

## 实现

- [x] `auth-service.ts`：`initAuthOnStartup()` 删除已登录时的 `auth:autoSync` 发送
- [x] `App.vue`：`handleLoginSuccess()` 不再调用 `handleSync()`；删除 `onAutoSync` 监听注册、`removeAutoSyncListener` 声明与清理
- [x] `preload/index.ts`：删除 `onAutoSync` API
- [x] `preload/index.d.ts`：删除 `onAutoSync` 类型声明

## 收尾

- [x] 更新 `openspec/specs/data-sync/spec.md`（同步仅手动触发）
- [x] `npm run typecheck:node` 通过
- [x] 归档 change 到 `openspec/changes/archive/`
