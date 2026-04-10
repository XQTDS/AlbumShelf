## 1. ncm-cli 登录命令封装

- [x] 1.1 在 `NcmCliService` 中新增 `getLoginStatus()` 方法，调用 `ncm-cli login status` 检查登录状态
- [x] 1.2 在 `NcmCliService` 中新增 `generateQrcode()` 方法，调用 `ncm-cli login qrcode` 生成二维码
- [x] 1.3 在 `NcmCliService` 中新增 `checkQrcodeStatus(key)` 方法，调用 `ncm-cli login check` 检查扫码状态
- [x] 1.4 在 `NcmCliService` 中新增 `logout()` 方法，调用 `ncm-cli logout` 退出登录

## 2. 主进程登录状态管理

- [x] 2.1 新建 `auth-service.ts`，维护登录状态内存变量，提供 `checkAndUpdateLoginStatus()` 方法
- [x] 2.2 在 `ipc-handlers.ts` 中注册登录相关 IPC handlers：`auth:getStatus`、`auth:generateQrcode`、`auth:checkQrcode`、`auth:logout`
- [x] 2.3 在 `index.ts` 中应用启动后调用 `checkAndUpdateLoginStatus()`，并向渲染进程发送初始状态

## 3. 窗口菜单栏集成

- [x] 3.1 修改 `buildAppMenu()` 函数，新增「账户」菜单，根据登录状态显示用户昵称或"未登录"
- [x] 3.2 实现菜单项点击事件：「登录」发送 `menu:openLogin` 事件，「退出登录」调用 `auth-service.logout()`
- [x] 3.3 在 `auth-service` 中实现 `rebuildMenu()` 方法，登录状态变化时重建菜单

## 4. Preload API 暴露

- [x] 4.1 在 `preload/index.ts` 中暴露 `auth.getStatus()`、`auth.generateQrcode()`、`auth.checkQrcode(key)`、`auth.logout()` 方法
- [x] 4.2 更新 `preload/index.d.ts` 类型定义
- [x] 4.3 暴露 `onLoginRequired` 和 `onMenuLogin` 事件监听器

## 5. 登录弹窗组件

- [x] 5.1 新建 `LoginModal.vue` 组件，实现二维码展示和状态轮询逻辑
- [x] 5.2 实现二维码加载状态（loading）、正常展示、已扫描、已过期四种 UI 状态
- [x] 5.3 实现刷新二维码功能
- [x] 5.4 实现登录成功后自动关闭弹窗

## 6. 登录引导弹窗

- [x] 6.1 新建 `LoginGuideModal.vue` 组件，展示登录引导信息
- [x] 6.2 实现「登录」按钮打开 `LoginModal`，「稍后」按钮关闭引导弹窗

## 7. App.vue 集成

- [x] 7.1 在 `App.vue` 中引入 `LoginModal` 和 `LoginGuideModal` 组件
- [x] 7.2 监听 `onLoginRequired` 事件，显示登录引导弹窗
- [x] 7.3 监听 `onMenuLogin` 事件，显示登录弹窗
- [x] 7.4 登录成功后调用现有的专辑同步逻辑

## 8. 测试验证

- [x] 8.1 验证应用启动时检查登录状态正常
- [x] 8.2 验证扫码登录流程完整可用
- [x] 8.3 验证菜单栏状态显示正确
- [x] 8.4 验证退出登录功能正常
