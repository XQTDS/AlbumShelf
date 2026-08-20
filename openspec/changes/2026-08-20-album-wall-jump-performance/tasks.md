# 任务清单：唱片墙快速跳转性能优化

## 主进程

- [x] `album-service.ts`：`AlbumQueryOptions` 增加 `fetchAll?: boolean`
- [x] `album-service.ts`：`queryAlbums` 在 `fetchAll` 时跳过 `LIMIT/OFFSET`（保留 COUNT），返回 `page:1, pageSize:total, totalPages:1`

## Preload

- [x] `preload/index.ts`：`albumList` options 增加 `fetchAll?: boolean`；修正类型漂移 `genre` → `genres`
- [x] `preload/index.d.ts`：`AlbumQueryOptions` 同步上述两处修改

## 渲染端（App.vue）

- [x] 提取 `buildAlbumQueryOptions()`（`fetchAlbums` 复用）；新增 `applyFullResult()`；新增 `loadingAll` ref
- [x] 重写 `fetchAlbumsAndScrollTo`：单次 `fetchAll` 拉全量 → `applyFullResult` → `scrollToAlbumRow`
- [x] `handleScrollSeek`：拖到已加载内容末尾且 `hasMore` 时 fetchAll，按比例重设滚动位置
- [x] `loadMore` 与 IntersectionObserver 回调增加 `!loadingAll` 守卫
- [x] `clearSearch` / `debouncedSearch`：存在选中专辑时 `resetAndFetch(selectedAlbumId)`
- [x] `toggleViewMode`：切换视图时同样定位保持选中
- [x] 网格卡片与表格行 `v-memo` 字段级依赖
- [x] 网格封面 `<img>` 增加 `loading="lazy" decoding="async"`
- [x] CSS：`.album-card` / `.album-table tbody tr.album-row` 增加 `content-visibility: auto` + `contain-intrinsic-size: auto <len>`

## 收尾

- [x] 更新 specs：`album-list-ui`（定位跳转加载 + 列表渲染性能 + 清空搜索保持选中）、`scroll-progress-bar`（拖到末尾补拉全量）；`album-search` 为在线搜索弹窗 spec，无需改动
- [x] 竞态修复：`fetchAlbums` 追加分支按 `page` 匹配丢弃过期分页结果，避免与列表重置/全量加载交错产生重复行
- [ ] 用户手动 `npm run dev` QA：
  1. 原始复现：搜索 → 选中底部专辑 → 点 ✕ 清空 → 一次加载后定位到该专辑、面板保持打开；再拖进度条到底 → 一次到位、无需反复拖动
  2. 无选中深拖：冷启动仅第 1 页 → 拖 thumb 到底 → 触发一次全量加载后落在真实底部
  3. 筛选清除（流派 chip 移除/清空流派/清空艺术家）、随机选、播放条封面点击：均单次加载定位、面板打开
  4. 视图切换表格↔网格：无重复/缺行，两种视图下跳底均正常，切换后定位保持选中
  5. content-visibility：快速滚动无卡片坍塌/重叠；表格行正常（异常则移除 `.album-row` 规则）；hover/选中缩放动画正常
  6. 懒加载：滚动时封面仅在视口附近加载，无 2,454 张并发 cover:// 请求；封面失败回退链正常
  7. v-memo：点卡片仅该卡重渲染；详情面板改评分后卡片角标/表格行同步更新；介质角标、播放按钮 spinner 正常
  8. 分页仍工作：初始加载与搜索结果的分页哨兵、加载提示正常
  9. 进度条：全量加载后 thumb 高度/位置正确，点击轨道跳转正常
  10. 无选中清空搜索：仍回顶部第 1 页（行为不变）
- [ ] QA 通过后归档 change 到 `openspec/changes/archive/`
- [ ] 按需同步 README.md（功能行为无新增，预计无需调整）
