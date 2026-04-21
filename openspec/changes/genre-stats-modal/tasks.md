## 1. 后端统计查询

- [x] 1.1 在 `AlbumService` 中新增 `getGenreStats()` 方法：执行 SQL 查询返回各风格名称及关联专辑数量（按数量降序），同时查询收藏总数和有风格标签的专辑数
- [x] 1.2 在 `ipc-handlers.ts` 中注册 `genre:stats` handler，调用 `albumService.getGenreStats()` 并返回结果

## 2. Preload API

- [x] 2.1 在 `preload/index.ts` 中新增 `genreStats()` 方法，调用 `ipcRenderer.invoke('genre:stats')`
- [x] 2.2 在 `preload/index.d.ts` 中新增 `genreStats` 类型声明

## 3. 前端弹窗组件

- [x] 3.1 新建 `GenreStatsModal.vue`：弹窗结构（遮罩层、标题栏、关闭按钮、内容区）
- [x] 3.2 实现弹窗打开时请求数据：调用 `window.api.genreStats()`，显示加载状态
- [x] 3.3 实现顶部辅助统计信息：显示收藏总数和有风格标签的专辑数
- [x] 3.4 实现 Top 15 水平条形图：风格名称 + 纯 CSS 条形（宽度按比例）+ 数量标签
- [x] 3.5 实现"其他"汇总行：风格数 > 15 时展示剩余数量之和
- [x] 3.6 实现空状态：无风格数据时显示提示文案
- [x] 3.7 实现弹窗关闭：点击关闭按钮或外部遮罩关闭弹窗

## 4. 集成到主界面

- [x] 4.1 在 `App.vue` 工具栏区域添加「📊 风格统计」按钮
- [x] 4.2 在 `App.vue` 中引入 `GenreStatsModal` 组件，绑定显示/隐藏状态