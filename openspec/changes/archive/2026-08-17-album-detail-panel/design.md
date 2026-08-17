# 设计：常驻详情面板

## 1. 布局结构

- 面板作为 `.table-wrapper` 内的第三个 in-flow flex 子元素（`table-scroll-container` flex:1 收窄为其让位），位于 `<ScrollProgressBar>` 之后
- 面板宽度恒定 `--panel-width: clamp(360px, 40vw, 620px)`（`:root` 定义），**无任何过渡动画** → 表格布局恒定、列表项永不横移
- 结构：`.detail-panel`（flex column）= `.panel-header`（固定，不滚动）+ `.panel-body`（flex:1 滚动，隐藏滚动条）

## 2. 状态与交互

- `selectedAlbumId` / `selectedAlbum` computed：选中 id 变化 → 面板内容即时切换（无动画）
- 取消选中（再点同行 / ✕ / Esc）→ `selectedAlbum` 为 null → 面板从详情切换到占位态，布局不变
- Esc：`window` keydown 监听（onMounted 注册 / onUnmounted 移除），App 级弹窗（登录、登录引导、在线搜索、手动修 ID、风格统计）打开时不响应
- `watch(selectedAlbumId)`：选中时加载曲目 + 无封面时补封面；null 分支重置风格编辑态（所有取消选中路径收敛）

## 3. 占位态

- 未选中专辑时 `.panel-empty` 居中显示 💿 图标 + "点击左侧专辑查看详情"
- 头部显示"专辑详情"占位标题，无 ✕ 按钮

## 4. 筛选过滤后的行为

选中专辑被搜索/筛选过滤出列表后，`selectedAlbum` computed 为 null → 面板回到占位态（布局不变）；条件移除、专辑回到列表后详情自动重现。

## 5. 样式要点

- `.detail-content`：flex column、`var(--surface)` 背景（上一轮已调整）
- `.detail-links`：`flex-wrap: wrap`（防 360px 窄面板横向溢出，上一轮已调整）
- 曲目列表随面板整体滚动（不嵌套滚动，上一轮已调整）
- 封面懒渲染：面板仅在选中时渲染内容，天然避免无效图片请求
