## 1. 后端 - CSV 操作

- [x] 1.1 在 `csv-writer.ts` 中新增 `appendAlbumToCsv()` 函数，支持追加单条专辑记录
- [x] 1.2 处理 CSV 文件不存在的情况：创建带表头的新文件

## 2. 后端 - AlbumService 扩展

- [x] 2.1 新增 `getCollectedNeteaseIds()` 方法，返回所有已收藏专辑的 netease_original_id 数组

## 3. 后端 - SyncManager 扩展

- [x] 3.1 新增 `syncSingleAlbum()` 方法，同步单张专辑到数据库
- [x] 3.2 同步完成后自动触发 MusicBrainz 补全（如果客户端可用）

## 4. 后端 - IPC Handlers

- [x] 4.1 新增 `album:searchOnline` handler，调用 `NcmCliService.searchAlbum()` 搜索专辑
- [x] 4.2 新增 `album:addToCollection` handler，追加 CSV + 触发单张同步
- [x] 4.3 新增 `album:getCollectedNeteaseIds` handler，返回已收藏 ID 列表

## 5. 前端 - Preload API

- [x] 5.1 在 `preload/index.ts` 中暴露 `albumSearchOnline`、`albumAddToCollection`、`albumGetCollectedNeteaseIds` 方法
- [x] 5.2 更新 `preload/index.d.ts` 类型定义

## 6. 前端 - 搜索弹窗组件

- [x] 6.1 创建 `AlbumSearchModal.vue` 组件，包含弹窗结构、搜索输入框
- [x] 6.2 实现搜索逻辑：调用 IPC、处理加载状态、错误提示
- [x] 6.3 实现结果列表渲染：封面、标题、艺术家、发行时间
- [x] 6.4 实现「添加」按钮逻辑：调用添加 IPC、更新按钮状态
- [x] 6.5 实现已收藏标识：比对 ID 列表，禁用按钮显示「已收藏」

## 7. 前端 - 入口集成

- [x] 7.1 在 `App.vue` 顶部工具栏添加「🔍 搜索专辑」按钮
- [x] 7.2 引入 `AlbumSearchModal` 组件，绑定显示/隐藏状态
- [x] 7.3 添加成功后触发专辑列表刷新

## 8. 样式与体验

- [x] 8.1 搜索弹窗样式：暗色主题、与现有弹窗风格一致
- [x] 8.2 搜索结果项样式：封面缩略图、文字排版、按钮状态
- [x] 8.3 添加 debounce 防止快速重复搜索
