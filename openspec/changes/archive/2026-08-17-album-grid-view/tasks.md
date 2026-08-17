# 任务清单

## 实现

- [x] `App.vue` 状态：新增 `viewMode` ref（初始读 localStorage `albumShelfViewMode`，默认 `'table'`）+ watch 持久化
- [x] `App.vue` 工具栏：`toolbar-left` 新增视图切换按钮（表格/网格图标 + title 提示），点击 `toggleViewMode`
- [x] `App.vue` 状态：新增 `gridSortKey` computed（sortBy/sortOrder 双向映射）与 `toggleViewMode`（切换 + `resetAndFetch`）
- [x] `App.vue` `fetchAlbums`：pageSize 按视图取 20/40
- [x] `App.vue` 模板：现有表格分支包入 `v-if="viewMode === 'table'"`；新增 `v-else` 网格分支（`.grid-scroll-container` 内 `.grid-toolbar` 排序下拉框 + `.album-grid` 卡片 + 全宽哨兵 div），两分支滚动容器/哨兵共用 `scrollContainerRef`/`sentinelRef`
- [x] `App.vue` 网格卡片：`v-for` 渲染 `.album-card`（`:class="{ selected }"`，`:data-id`，`@click="toggleSelect(album.id)"`），封面 img（复用 `coverErrorSet`/`onCoverError`）或 💿 占位，hover 遮罩显示标题（两行截断）+艺术家（无播放按钮）
- [x] `App.vue` 样式：新增 `.album-grid`（`repeat(auto-fit, minmax(120px, 1fr))`）、`.album-card`、`.card-overlay`、`.grid-toolbar`、`.cover-placeholder`（复用主题变量与 `--radius`）
- [x] `App.vue` `scrollToAlbumRow`：选择器改 `.album-row, .album-card`，定位改 `getBoundingClientRect` 差值计算
- [x] 更新 `openspec/specs/album-list-ui/spec.md`（视图切换、网格展示、网格排序需求；无限滚动等需求扩展为视图通用）

## 收尾

- [ ] 用户手动 `npm run dev` 验证（见下）
- [x] 归档 change 到 `openspec/changes/archive/`

### 手动 QA 清单

- 表格 → 网格切换：按钮可点击、选择持久化（重启保持）、默认表格
- 网格视图：封面墙排布随窗口宽度变化（拉宽/拉窄时卡片尺寸与列数同时变化、空间始终铺满无两侧空白）；无封面专辑显示 💿；hover 遮罩显示标题+艺术家；点击选中高亮并更新右侧详情面板，再点取消
- 网格排序下拉框：默认/我的评分/MB评分/发行日期各升降序生效；表格列头排序后切到网格，下拉框反映当前排序（反之亦然）
- 无限滚动：两种视图下滚动到底部自动加载（表格 20/页、网格 40/页）
- 搜索/艺术家筛选/风格筛选：两种视图下均正常过滤并重置列表
- 随机选择：两种视图下均能滚动定位到目标专辑并选中
- 滚动进度条：两种视图下进度显示与拖拽 seek 正常
- 详情面板：切换视图时保持常驻与选中状态不闪烁
