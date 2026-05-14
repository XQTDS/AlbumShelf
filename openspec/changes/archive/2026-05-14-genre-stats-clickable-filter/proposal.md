## Why

风格统计弹窗当前只展示 Top 15 风格 + 「其他」汇总，剩余风格无法在弹窗中查看。同时弹窗只是被动展示数据——用户看到一个感兴趣的风格后，还要手动关闭弹窗、再去顶部输入框搜索，操作链路冗长。让弹窗内的每个风格条目可点击直接触发筛选，能把「发现感兴趣的风格 → 浏览该风格专辑」串成一步。

## What Changes

- 移除 Top 15 截断和「其他」汇总行，弹窗 SHALL 列出所有风格的条形图
- 每个风格条目可点击：点击后将该风格加入当前已选风格筛选并关闭弹窗
- 鼠标悬停在条目上时给予明显的可点击视觉反馈（背景高亮、标签高亮、`cursor: pointer`）

## Capabilities

### Modified Capabilities
- `genre-stats`: 改为展示全部风格；每个条目可点击触发筛选

## Impact

- **前端**：
  - `GenreStatsModal.vue`：去掉 `TOP_N` 截断逻辑；新增 `selectGenre` emit；条目改为可点击 + 悬停态样式；删除不再使用的「其他」相关样式
  - `App.vue`：监听 modal 的 `select-genre` 事件，新增 `handleSelectGenreFromStats(genre)` 把风格追加到 `selectedGenres` 并 `resetAndFetch()`
- **后端 / Preload**：无变更（`genreStats()` 接口已返回完整 stats 列表）
