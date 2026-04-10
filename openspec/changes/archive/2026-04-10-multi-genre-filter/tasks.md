## 1. 后端 API 修改

- [x] 1.1 修改 `album-service.ts` 中的 `getAlbums` 方法，将 `genre` 参数改为 `genres`（逗号分隔字符串）
- [x] 1.2 实现多风格 AND 查询逻辑，使用子查询 + HAVING COUNT 方式
- [x] 1.3 更新 IPC handler 以支持新的 `genres` 参数

## 2. 前端状态管理

- [x] 2.1 将 `selectedGenre: Ref<string>` 替换为 `selectedGenres: Ref<string[]>`
- [x] 2.2 创建 `toggleGenre(genre: string)` 方法用于切换风格选中状态
- [x] 2.3 创建 `clearGenres()` 方法用于清除所有已选风格
- [x] 2.4 更新 `applyFilters()` 方法以传递多风格参数

## 3. 风格输入组件

- [x] 3.1 移除原有的单选下拉框 `<select>`
- [x] 3.2 创建风格输入框 UI（带 placeholder）
- [x] 3.3 实现自动完成功能：监听输入，过滤匹配的风格
- [x] 3.4 实现自动完成下拉列表（显示匹配结果，排除已选风格）
- [x] 3.5 实现从下拉列表选择风格添加到筛选条件

## 4. 已选风格标签展示

- [x] 4.1 在工具栏下方添加已选风格标签展示区域
- [x] 4.2 为每个已选风格标签添加移除按钮（✕）
- [x] 4.3 添加"清除全部"按钮（仅当有已选风格时显示）
- [x] 4.4 添加相应的 CSS 样式

## 5. 专辑风格标签交互

- [x] 5.1 为专辑列表中的 `.genre-tag` 添加点击事件，调用 `toggleGenre`
- [x] 5.2 为详情展开区域中的 `.genre-tag` 添加点击事件
- [x] 5.3 添加已选风格的高亮样式类 `.genre-tag.selected`
- [x] 5.4 动态绑定高亮样式：根据风格是否在 `selectedGenres` 中
- [x] 5.5 添加 hover 效果提示可点击（cursor: pointer）

## 6. 样式完善

- [x] 6.1 添加风格输入组件样式（输入框、下拉列表）
- [x] 6.2 添加已选风格标签区域样式
- [x] 6.3 添加高亮状态的 `.genre-tag.selected` 样式
- [x] 6.4 确保响应式布局适配
