# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-08-19-grid-view-play-album/` 变更文档（proposal/design/tasks）

## 渲染层

- [x] `src/renderer/src/App.vue`：
  - 唱片墙 `.album-card` 内新增右下角悬停播放按钮（`@click.stop` 调 `handlePlayAlbum`，播放中 disabled + spinner）
  - 新增 `.btn-play-card` 样式（absolute 定位右下角、悬停淡入、disabled 保持可见）
  - `.card-badge` 最大宽度收紧为 `calc(100% - 44px)`，为播放按钮预留空间

## 收尾

- [x] 更新 `openspec/specs/album-list-ui/spec.md`：新增「唱片墙播放整张专辑」Requirement；修订「悬停显示信息」场景（遮罩本身仍无播放按钮，播放按钮位于卡片右下角）
- [x] 同步 `README.md`（「专辑墙浏览」条目补充悬停播放能力）
- [x] 用户手动 `npm run dev` QA：
  - 唱片墙悬停卡片 → 右下角出现 ▶ 按钮，中央遮罩仍只显示专辑名/艺术家
  - 点击 ▶ → 播放整张专辑，底部播放条出现且信息正确；卡片选中状态不变
  - 播放发起中按钮变 spinner 且不可再点（与表格视图一致）
  - 选择非默认排序（出现左下角角标）时，长角标文本不与右下角按钮重叠
  - 点击卡片空白处选中/取消选中行为不回退
- [x] QA 通过后归档 change 到 `openspec/changes/archive/`
