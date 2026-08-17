# 任务清单

## 实现

- [x] `App.vue` 模板：`.detail-cover` 与 `.detail-info` 包入新增 `.detail-hero` 容器（内容零改动）
- [x] `App.vue` 样式：新增 `.detail-hero`；`.detail-cover` 改流体正方形（`clamp(140px, 42%, 240px)` + `aspect-ratio: 1/1`）；`.cover-img`/`.cover-placeholder` 改 100% 尺寸
- [x] `App.vue` 样式：`.genre-edit-input`/`.genre-edit-suggestions` 改 `width: 100%; max-width: 200px;`
- [x] 更新 `openspec/specs/album-detail-expand/spec.md`（详情内容展示补充 hero 两栏布局描述）

## 收尾

- [x] `typecheck:web` 输出与改动前基线一致（`window.api` 类型声明等既有错误），本次改动未引入新错误
- [ ] `npm run dev` 手动 QA（900/1200/1600 三档窗口宽度下：封面放大无溢出、编辑输入框不溢出、占位态/切换/曲目列表正常）
- [x] 归档 change 到 `openspec/changes/archive/`
