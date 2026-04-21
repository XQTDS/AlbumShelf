## 1. 后端 IPC Handler

- [x] 1.1 在 `ipc-handlers.ts` 中新增 `album:setGenres` handler，接收 `albumId: number` 和 `genres: string[]`，校验专辑存在后调用 `albumService.setAlbumGenres()`，返回操作结果

## 2. Preload API 类型定义

- [x] 2.1 在 `preload/index.ts` 中新增 `setAlbumGenres(albumId: number, genres: string[]): Promise<{ success: boolean; error?: string }>` 方法，调用 `album:setGenres` IPC
- [x] 2.2 在 `preload/index.d.ts` 中新增 `setAlbumGenres` 类型声明

## 3. 前端编辑态 UI

- [x] 3.1 在 `App.vue` 中新增编辑态状态变量：`editingGenreAlbumId`、`editingGenres`、`genreEditInput`、`showGenreEditSuggestions`
- [x] 3.2 在详情展开区「风格」区域旁增加 ✏️ 编辑按钮，点击后进入编辑态（设置 `editingGenreAlbumId` 并复制当前风格到 `editingGenres`）
- [x] 3.3 实现编辑态模板：已选风格标签（带 ✕ 删除按钮）、自动补全输入框、保存和取消按钮
- [x] 3.4 实现自动补全逻辑：从 `allGenres` 列表中筛选匹配项，排除已选风格，不区分大小写
- [x] 3.5 实现删除风格标签逻辑：点击 ✕ 从 `editingGenres` 中移除
- [x] 3.6 实现保存逻辑：调用 `window.api.setAlbumGenres()`，成功后更新本地 `albums` 数据并退出编辑态；失败时显示错误提示
- [x] 3.7 实现取消逻辑：丢弃 `editingGenres`，清空 `editingGenreAlbumId` 退出编辑态

## 4. 样式

- [x] 4.1 为编辑态新增 CSS 样式：编辑按钮、编辑态标签（带 ✕）、自动补全输入框和下拉列表、保存/取消按钮，与已有风格筛选组件风格保持一致