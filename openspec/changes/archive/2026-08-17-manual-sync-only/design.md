# 设计：同步仅手动触发

## 1. 移除自动触发路径

| 路径 | 文件 | 改动 |
|------|------|------|
| 启动时已登录 → autoSync | `auth-service.ts` `initAuthOnStartup()` | 删除 `auth:autoSync` 发送分支，保留未登录时的 `auth:loginRequired` |
| 登录成功 → 同步 | `App.vue` `handleLoginSuccess()` | 删除 `await handleSync()`，仅保留登录成功提示 |
| 事件通道 | `App.vue` / `preload/index.ts` / `preload/index.d.ts` | 删除 `onAutoSync` 监听注册、`removeAutoSyncListener` 声明与清理、preload 中的 API 与类型 |

## 2. 保留的触发入口

菜单栏「数据 → 同步专辑列表」→ `menu:syncAlbums` → `handleSync()`，唯一同步入口。

## 3. 登录成功后的表现

- 提示「登录成功」后，用户自行通过菜单栏触发同步
- 若数据库为空，空状态页面已引导用户使用菜单栏入口
