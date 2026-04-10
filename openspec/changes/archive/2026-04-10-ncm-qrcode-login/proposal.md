## Why

AlbumShelf 依赖网易云音乐的数据（专辑、曲目等），但目前没有登录流程。未登录状态下，ncm-cli 无法获取完整的用户数据（如收藏专辑），且部分 API 可能受限。需要接入网易云音乐扫码登录，让用户可以通过手机 App 扫码快速登录，并在应用内管理登录状态。

## What Changes

- 新增窗口菜单栏「账户」菜单，显示当前登录状态（昵称或"未登录"）
- 新增扫码登录弹窗，展示二维码供用户扫码
- 应用启动时自动检查登录状态
- 未登录时弹出登录引导提示
- 登录成功后自动触发专辑列表同步
- 支持退出登录功能

## Capabilities

### New Capabilities

- `ncm-auth`: 网易云音乐认证能力，包括扫码登录流程、登录状态检查、退出登录、用户信息获取

### Modified Capabilities

- `album-list-ui`: 新增登录弹窗组件，登录成功后触发专辑列表刷新

## Impact

- **主进程 (main)**:
  - `index.ts`: 菜单栏新增「账户」菜单，启动时检查登录状态
  - `ncm-cli-service.ts`: 新增登录相关命令封装（qrcode 生成、状态轮询、登录状态查询、退出登录）
  - `ipc-handlers.ts`: 新增登录相关 IPC handlers

- **渲染进程 (renderer)**:
  - 新增登录弹窗组件 `LoginModal.vue`
  - `App.vue`: 集成登录弹窗，处理登录成功后的同步逻辑

- **Preload**:
  - `index.ts` / `index.d.ts`: 暴露登录相关 API

- **外部依赖**:
  - `ncm-cli`: 需要支持 `login qrcode`、`login status`、`logout`、`user profile` 等命令
