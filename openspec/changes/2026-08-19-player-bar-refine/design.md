# 技术方案

## 1. 信息区两行布局（去掉专辑名）

`PlayerBar.vue`：

- 删除 `albumTitle` prop 与 `.player-album` 行；`App.vue` 不再传 `:album-title`。
- `nowPlaying.albumTitle` 字段保留（播放上下文元数据，见非目标）。
- 信息区改为两行：`.player-info-line` 容器 × 2，歌曲名行（14px/600，`--text` 色）、艺术家行（12px/400，`--text-secondary` 色）。行高固定（20px + 16px），播放条整体高度稳定。

## 2. 封面点击定位专辑详情

`PlayerBar.vue`：`.player-cover` 由 `div` 改为 `button`（新增 `coverClick` emit、`title="查看专辑详情"` 提示、hover 描边反馈、`cursor: pointer`）。

`App.vue` 新增 `handlePlayerCoverClick`：

- `nowPlaying.albumId` 为空时直接忽略。
- 专辑已在当前 `albums` 列表中 → 直接 `selectedAlbumId = albumId`（选中 watch 自动加载曲目/热评），不滚动列表（避免打断用户当前浏览位置）。
- 专辑不在当前列表（被搜索/筛选/分页过滤）→ 清除搜索词/艺术家筛选/风格筛选/排序（镜像 `handleRandomPick` 的清条件逻辑），重置分页（`currentPage = 1`、`hasMore = true`、`albums = []`），复用 `fetchAlbumsAndScrollTo(albumId)` 分页加载并滚动定位，完成后 `selectedAlbumId = albumId`。

复用既有 `fetchAlbumsAndScrollTo` / `selectedAlbumId` watch 机制，无新增 IPC。

## 3. 固定宽度 + 超长文本缓慢滚动

CSS 层面：

- `.player-info`：`flex-shrink: 0` + 固定 `width: 220px`。窗口最小宽度 900px 下整条播放条（封面 44 + 信息 220 + 播控 ~112 + 时间 ~34 + 进度 min 80 + 音量 ~114 + 停止 32 + 间距）约 720px，无挤压风险。
- 每行 `.player-info-line`：`overflow: hidden; white-space: nowrap;`，文本 span 为 `inline-block`，超出部分被裁切。

滚动逻辑（`PlayerBar.vue` 内实现，纯前端）：

- 测量：watch `trackTitle/trackArtist` 变化 → `nextTick` 后比较文本 span 的 `scrollWidth` 与行容器的 `clientWidth`，溢出 > 4px 时生成滚动样式，否则返回空样式静态显示。
- 动画：单程平移 `--marquee-distance: -(溢出px)`，`@keyframes player-marquee` 从 `translateX(0)` 到 `translateX(var(--marquee-distance))`，`infinite alternate` 实现缓慢往返滚动；单程时长 = 溢出宽度 ÷ 24px/s（下限 4s），`ease-in-out`，起始延迟 1.2s（短文本切换不立即起滚）。
- 重启：文本 span 以文本内容为 `:key` 重建，切换歌曲后动画从起点重新开始。
- 辅助：span 上保留原生 `title`，悬停可见完整文本。
- 注意：动画名由内联 style 引用，`@keyframes` 必须写在非 scoped 的 `<style>` 块中——scoped 块会把 keyframes 名称改写为带 data-v 哈希（经 `@vue/compiler-sfc` 实测），内联 `animation` 引用将失配。

不使用现成 marquee 组件库（零依赖，逻辑约 30 行）。
