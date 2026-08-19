# 任务清单

- [x] index.ts: 注册 `app:getVersion` handler；新增「帮助」菜单（关于 / 访问 GitHub 仓库）；macOS about 项改为自定义 click
- [x] preload/index.ts: 暴露 `appGetVersion` 与 `onMenuOpenAbout`
- [x] preload/index.d.ts: 类型声明
- [x] AboutModal.vue: 新建关于弹窗（版本号获取、GitHub 链接、内容分区）
- [x] App.vue: 挂载 AboutModal、监听菜单事件、Esc 守卫加入弹窗状态
