## Context

- 列表 UI 集中在 `src/renderer/src/App.vue`（3068 行单文件）：`<main class="table-wrapper">` 内含表格滚动容器（`.table-scroll-container` + `<table class="album-table">`，粘性表头、可排序列头）、`ScrollProgressBar` 自定义滚动条、常驻详情面板（`.detail-panel`，恒定宽度 `clamp(360px, 40vw, 620px)`）
- 数据管线：`albums` ref + `fetchAlbums(append)` 调 `window.api.albumList`（服务端筛选/排序/分页，`pageSize = 20`），无限滚动靠 `IntersectionObserver` 监听哨兵元素（表格内是一个 `<tr>`），`watch(sentinelRef/scrollContainerRef)` 在元素变化时重建 observer
- `albumList` 返回 `SELECT a.*`，已含 `cover_url` 字段；库中部分专辑 cover_url 为空（已有「补全缺失封面」菜单批量修复，本次不改数据层）
- 选中逻辑：`selectedAlbumId` + `toggleSelect`；`scrollToAlbumRow` 通过 `querySelectorAll('tr.album-row')` 定位（随机选择、取消筛选保持位置时使用）
- 排序：`sortBy`/`sortOrder` ref 驱动服务端排序，仅表格列头可操作

## Goals / Non-Goals

**Goals:**
- 表格/网格两种排布可随时切换，切换入口在顶部工具栏，选择持久化
- 网格视图：纯封面唱片墙，hover 半透明遮罩显示专辑名+艺术家（用户确认不显示播放按钮）
- 网格模式下仍可用排序，且与表格排序状态一致
- 既有交互（搜索/筛选/无限滚动/详情面板/随机选择/滚动定位）在两种视图下均正常

**Non-Goals:**
- 不改后端、IPC、preload（数据接口完全复用）
- 网格内不做远程封面按需拉取（ncm-cli 风控考虑，已有批量补全菜单覆盖数据侧）
- 网格单元格不显示评分、风格等元数据（纯封面 + hover 标题/艺术家）
- 不做虚拟滚动（沿用现有分页 + 无限滚动机制）

## Decisions

### 1. 模板用 v-if/v-else 双分支，滚动容器与哨兵共用同一 ref

**决策**：`<main class="table-wrapper">` 内 `v-if="viewMode === 'table'"` 渲染现有表格分支，`v-else` 渲染网格分支；两个分支的滚动容器都用 `ref="scrollContainerRef"`、哨兵元素都用 `ref="sentinelRef"`。`ScrollProgressBar` 与 `.detail-panel` 放在分支外共用。

**理由**：v-if/v-else 保证同一时刻只有一个元素持有 ref，Vue 会切换 ref 指向；现有的 `watch(scrollContainerRef)`（重建 IntersectionObserver）与 `watch(sentinelRef)`（重新 observe）无需改动即可在两个视图间自动切换。网格的哨兵是 grid 容器末尾的一个全宽 div（`grid-column: 1 / -1`）。

### 2. 视图模式状态与持久化

**决策**：`const viewMode = ref<'table' | 'grid'>(localStorage.getItem('albumShelfViewMode') === 'grid' ? 'grid' : 'table')`，`watch` 变化时写入 localStorage。切换按钮放在工具栏 `toolbar-left`（随机选择按钮旁），图标按钮 + title 提示。

**理由**：纯前端偏好，localStorage 足够，无需后端持久化；默认表格保持现状行为不变。

### 3. 排序状态共享：computed 下拉值映射 sortBy/sortOrder

**决策**：新增 computed `gridSortKey`，getter 把 `sortBy` + `sortOrder` 映射为单个字符串键（`''` | `mb_rating-desc` | `mb_rating-asc` | `user_rating-desc` | `user_rating-asc` | `release_date-desc` | `release_date-asc`），setter 反向解析写回 `sortBy`/`sortOrder` 并调用 `resetAndFetch()`。下拉框选项：默认排序、我的评分（降/升）、MB评分（降/升）、发行日期（降/升）。

**理由**：表格列头点击会改 `sortBy`/`sortOrder`，computed getter 保证切到网格时下拉框自动反映当前排序；反之亦然。复用现有 `resetAndFetch` 语义（条件变化重置列表）。

### 4. 网格布局与卡片：auto-fit + minmax(120px, 1fr) 始终铺满

**决策**：`.album-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; padding: 12px; }`。卡片 `.album-card { aspect-ratio: 1/1; position: relative; overflow: hidden; cursor: pointer; }`（无圆角，唱片墙保持方正），封面图 `object-fit: cover` 填满。**卡片内封面/占位符需显式清零圆角与阴影**（`.album-card .cover-img/.cover-placeholder { border-radius: 0; }`）：`overflow: hidden` 只能裁掉卡片之外的内容，`.cover-img` 自身的圆角会裁掉图片内侧四角、露出页面底色，观感仍像圆角。hover 遮罩 `.card-overlay`（`rgba(0,0,0,.55)`，opacity 过渡）内显示标题（两行截断）+ 艺术家（单行截断）。选中态 `outline: 2px solid var(--primary)`（使用主题变量）。最小尺寸 120px 定义为样式常量，后续微调只需改 `minmax` 一处数值。

**理由**：初版采用 `auto-fill, minmax(120px, 200px)` + `justify-content: center`，实测窗口宽度变化时卡片尺寸几乎不变（轨道按最小尺寸建列，增长空间被"能否再放一列"吸走），只有列数变化，且卡片到 200px 上限后两侧留白。改用 `auto-fit + minmax(120px, 1fr)`：窗口变宽时卡片尺寸随宽度连续增长，放不下新一列时才折行，空间始终被卡片铺满、无两侧空白，满足"尺寸与列数同时变化"的目标。卡片尺寸天然有界：即将新增一列时达到最大（两列时约 186px，列数越多越接近 120px），不会被 1fr 无限放大，实际效果接近"120px 下限 + 隐含上限"；折行瞬间卡片从 ~186px 回落到 120px 的锯齿是网格布局固有行为，幅度可接受。

### 5. 封面缺失/失败 → 💿 占位

**决策**：卡片内 `v-if="album.cover_url && !coverErrorSet.has(album.id)"` 渲染 `<img>`（`@error` 复用现有 `onCoverError`），否则渲染 `.cover-placeholder`（💿，样式同详情面板占位风格）。

**理由**：与详情面板现有模式一致；`coverErrorSet` 防失败重试的机制直接复用。

### 6. 网格 pageSize 40，切换视图重置列表

**决策**：`fetchAlbums` 中 `pageSize` 按当前视图取 20（表格）/ 40（网格）；`toggleViewMode` 切换后调用 `resetAndFetch()`（清空列表、回到第一页、按新尺寸重新加载）。

**理由**：网格单元格小，40 张约 2-4 行，减少无限滚动触发频率；切换时重置避免两种 pageSize 分块混在同一列表里。后端 `LIMIT @limit` 无上限约束，无需改动。

### 7. scrollToAlbumRow 改为视图通用定位

**决策**：选择器从 `tr.album-row` 改为 `.album-row, .album-card`（两种视图 DOM 顺序均与 `albums` 数组一致，按索引取即可）；定位计算从 `offsetTop` 改为 `getBoundingClientRect`：`container.scrollTop = cardTop - containerTop + container.scrollTop - containerHeight/2 + cardHeight/2`。

**理由**：网格卡片的 `offsetTop` 相对 offsetParent（可能是 body），不可靠；rect 差值计算对表格行与网格卡片通用，行为与现状（目标居中显示）一致。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| 双模板分支增大 App.vue 体积（已 3068 行） | 网格分支只含容器/卡片/排序条，交互逻辑全部复用现有函数；后续可考虑抽组件，本次不做 |
| 部分专辑无封面，网格占位 💿 比例高时观感差 | 已有「补全缺失封面」菜单可批量修复数据；占位样式与详情面板一致 |
| 切换视图时重置列表丢失滚动位置 | 用户可接受的取舍（分页尺寸不同必须重置）；重置后回到顶部 |
| localStorage 在 Electron 渲染进程可用性 | 常规 Web API，现有渲染进程可直接使用；读取失败（异常）时回退默认表格 |
