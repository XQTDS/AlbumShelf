# 任务清单

- [x] database.ts: 实现 exportDatabase() 和 importDatabase()
- [x] ipc-handlers.ts: 注册 db:export 和 db:import handler（含 dialog 调用）
- [x] index.ts: 菜单「数据」增加导出/导入项
- [x] preload/index.ts: 暴露 dbExport/dbImport 方法和菜单事件监听
- [x] preload/index.d.ts: 类型声明
- [x] App.vue: 监听菜单事件，调用 API，显示结果提示
