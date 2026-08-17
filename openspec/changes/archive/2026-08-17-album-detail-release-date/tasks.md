# 任务清单

## 实现

- [x] `App.vue` 模板：元数据区在「评分人数」与「曲目数」之间新增「发行日期」meta-item（`selectedAlbum.release_date || '—'`）
- [x] 更新 `openspec/specs/album-detail-expand/spec.md`（内容清单与完整数据展示 scenario 补充发行日期）

## 收尾

- [ ] 用户手动 `npm run dev` QA（详情面板元数据区显示发行日期；为空时显示"—"）
- [x] 归档 change 到 `openspec/changes/archive/`
