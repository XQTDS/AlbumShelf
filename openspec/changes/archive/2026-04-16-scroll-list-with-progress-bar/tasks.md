## 1. 创建滚动进度条组件

- [x] 1.1 创建 `ScrollProgressBar.vue` 组件骨架，定义 props（scrollContainer）和 emits（seek）
- [x] 1.2 实现进度条轨道和滑块的基础 HTML/CSS 结构（6px 宽度，圆角）
- [x] 1.3 监听 scrollContainer 的 scroll 事件，计算并更新滑块位置
- [x] 1.4 实现滑块拖动功能（mousedown → mousemove → mouseup）
- [x] 1.5 实现点击轨道跳转到对应位置
- [x] 1.6 实现滚动状态视觉变化（滚动时高亮，静止 1 秒后淡化）

## 2. 重构表格布局

- [x] 2.1 调整 `.table-container` 为 flex 布局，包含表格区域和进度条区域
- [x] 2.2 将表格包裹在可滚动容器中，设置固定高度（或 flex-grow）
- [x] 2.3 使用 CSS `position: sticky` 实现表头固定
- [x] 2.4 隐藏原生滚动条（`::-webkit-scrollbar { display: none; }`）

## 3. 实现无限滚动

- [x] 3.1 添加哨兵元素（sentinel）到表格 tbody 末尾
- [x] 3.2 使用 IntersectionObserver 监听哨兵元素进入视口
- [x] 3.3 实现 `loadMore` 函数：请求下一页并追加到 albums 数组
- [x] 3.4 添加 `loadingMore` 状态和加载指示器（spinner）
- [x] 3.5 添加 `hasMore` 状态，全部加载完成后停止触发

## 4. 移除分页并集成组件

- [x] 4.1 移除底部分页控件（`<footer class="pagination">`）
- [x] 4.2 移除分页相关状态和方法（currentPage, totalPages, goToPage 等）
- [x] 4.3 在表格区域旁集成 ScrollProgressBar 组件
- [x] 4.4 处理 seek 事件：根据进度百分比计算并设置 scrollTop

## 5. 处理筛选/排序重置

- [x] 5.1 在筛选/排序条件变化时，清空 albums 数组并重置 currentPage 为 1
- [x] 5.2 重新调用 fetchAlbums 加载首批数据
- [x] 5.3 重置滚动位置到顶部

## 6. 样式调整与测试

- [x] 6.1 调整进度条颜色和透明度，确保视觉效果符合设计
- [x] 6.2 测试不同数量专辑的滚动和加载行为
- [x] 6.3 测试筛选/排序后的列表重置行为
- [x] 6.4 测试进度条拖动和点击定位功能
