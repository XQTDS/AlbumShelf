## 1. 风格统计弹窗

- [x] 1.1 `GenreStatsModal.vue`：移除 `TOP_N` 常量和「其他」聚合逻辑，`displayItems` 直接返回完整 `stats`
- [x] 1.2 `GenreStatsModal.vue`：声明新 emit `selectGenre: [name: string]`，新增 `selectGenre(name)` 方法，先 `emit('selectGenre', name)` 再 `emit('close')`
- [x] 1.3 `GenreStatsModal.vue`：条形图 `.bar-row` 增加 `@click="selectGenre(item.name)"` 与 `:title="点击筛选「...」"`
- [x] 1.4 `GenreStatsModal.vue`：样式增加 `cursor: pointer` 与 hover 背景/标签高亮；删除不再使用的 `.bar-row-other` / `.bar-fill-other` 样式

## 2. 主界面集成

- [x] 2.1 `App.vue`：在 `<GenreStatsModal>` 上绑定 `@select-genre="handleSelectGenreFromStats"`
- [x] 2.2 `App.vue`：新增 `handleSelectGenreFromStats(genre)`，若 `selectedGenres` 中尚不包含该风格则追加并调用 `resetAndFetch()`

## 3. 验证

- [x] 3.1 类型检查通过（`npm run typecheck` / 编辑器无新报错）
- [x] 3.2 手动测试：打开「📊 风格统计」→ 滚动列表可见全部风格 → 点击任一风格条目 → 弹窗关闭且专辑列表已按该风格筛选
