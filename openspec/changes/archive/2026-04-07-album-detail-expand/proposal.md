## Why

当前专辑列表表格中，风格标签最多只显示 3 个，超出部分以 "+N" 折叠。用户无法查看完整的风格标签，也无法看到封面图、MusicBrainz 链接等详细信息。需要提供一种方式让用户点击专辑行后展开查看完整的专辑详情。

## What Changes

- 专辑表格行支持点击展开/收起详情区域（手风琴模式，同一时间只展开一行）
- 展开的详情区域包含：
  - 封面图（来自 cover_url）
  - 所有风格标签（完整展示，不再截断）
  - MusicBrainz 链接（基于 musicbrainz_id 拼接 URL）
  - 网易云音乐链接（基于 netease_id 拼接 URL）
  - 补充元数据：评分人数（mb_rating_count）、曲目数（track_count）、同步时间（synced_at）、补全时间（enriched_at）
- 展开/收起带有平滑过渡动画

## Capabilities

### New Capabilities
- `album-detail-expand`: 专辑行展开详情功能，包含展开/收起交互、详情区域布局和内容展示

### Modified Capabilities

## Impact

- 修改 `src/renderer/src/App.vue`：新增展开/收起逻辑和详情区域模板及样式
- 可能需要调整 `album:list` IPC 返回数据，确保包含 cover_url、netease_id、musicbrainz_id 等字段（当前已包含）
