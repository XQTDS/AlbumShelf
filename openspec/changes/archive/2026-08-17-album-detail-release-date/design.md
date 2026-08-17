# 设计

## 方案

纯前端展示改动，无数据层变化：

- `release_date` 字段已存在于 Album 接口、数据库与列表视图（`App.vue` 的「发行日期」列）
- 详情面板 `detail-meta` 区新增一个 `meta-item`，复用现有 `meta-label` / `meta-value` 样式，无需新增 CSS
- 展示逻辑与列表列一致：`selectedAlbum.release_date || '—'`

## 位置

放在「评分人数」与「曲目数」之间：上两行是评分信息，下两行是曲目信息，发行日期作为专辑本身的元数据插在中间，语义分组清晰。
