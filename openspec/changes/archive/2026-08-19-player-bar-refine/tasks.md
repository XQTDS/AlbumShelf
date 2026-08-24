# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-08-19-player-bar-refine/` 变更文档（proposal/design/tasks）

## 渲染层

- [x] `src/renderer/src/PlayerBar.vue`：
  - 删除 `albumTitle` prop 与专辑名展示行；信息区改为两行（歌曲名在上、艺术家在下，行高固定）
  - 信息区固定宽度 220px（`flex-shrink: 0`），文本超长时缓慢往返滚动（测量溢出 + `player-marquee` 动画 + 文本 key 重建重启），悬停 `title` 显示完整文本
  - `.player-cover` 改为 button：新增 `coverClick` emit、`查看专辑详情` 提示、hover 描边与指针反馈
- [x] `src/renderer/src/App.vue`：
  - 移除 `:album-title="nowPlaying.albumTitle"` 绑定，接入 `@cover-click="handlePlayerCoverClick"`
  - 新增 `handlePlayerCoverClick`：专辑在列表中直接选中；被过滤时清除搜索/筛选/排序条件，重置分页后复用 `fetchAlbumsAndScrollTo` 定位并选中

## 收尾

- [x] 更新 `openspec/specs/playback/spec.md`：「播放控制与状态展示」调整播放条展示内容（歌曲名/艺术家两行、不展示专辑名），新增「信息区固定宽度与超长滚动」「封面点击定位专辑详情」场景
- [x] 更新 `openspec/specs/album-detail-expand/spec.md`：新增「播放条封面选中专辑」Requirement
- [x] 同步 `README.md`（内置播放条目：歌曲/艺术家展示、超长滚动、点击封面直达专辑详情）
- [x] 用户手动 `npm run dev` QA：
  - 播放条信息区仅显示歌曲名（上）与艺术家（下），不再出现专辑名
  - 切换歌曲（下一首/上一首/换专辑播放）：播放按钮与进度条位置不再变化
  - 长歌曲名/艺术家：文本缓慢往返滚动，悬停可看完整文本；短文本静态显示
  - 点击封面：详情面板展示当前专辑；先搜索/筛选过滤掉该专辑再点封面 → 清除条件、列表滚动定位到该专辑并选中
  - 既有播放条功能不回退：播放/暂停、上下首、进度拖拽、音量、停止、退出停播
- [x] QA 通过后归档 change 到 `openspec/changes/archive/`
