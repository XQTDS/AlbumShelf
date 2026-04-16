## Why

用户目前只能通过手动编辑 CSV 文件或从网易云音乐导入已收藏专辑来添加专辑。缺少一个便捷的方式来**发现和添加新专辑**。用户希望能够直接在应用内搜索网易云音乐的专辑库，找到感兴趣的专辑后一键添加到收藏列表中。

## What Changes

- **新增搜索弹窗组件**：独立的 Modal 界面，提供专注的搜索体验
- **集成 ncm-cli 搜索功能**：调用 `ncm-cli search album` 命令搜索网易云音乐专辑库
- **搜索结果展示**：列表布局展示每张专辑的封面、标题、艺术家、发行时间
- **一键添加收藏**：点击按钮将专辑写入 CSV 文件并自动触发同步
- **重复检测**：搜索结果中已收藏的专辑标记为"已收藏"，禁用添加按钮

## Capabilities

### New Capabilities

- `album-search`: 在线搜索网易云音乐专辑库，支持关键词搜索、结果展示、添加到收藏

### Modified Capabilities

- `data-sync`: 新增单张专辑写入 CSV 并同步的流程（原流程是批量同步）

## Impact

- **前端**：新增 `AlbumSearchModal.vue` 组件，修改 `App.vue` 添加入口按钮
- **后端 IPC**：新增 `album:searchOnline`、`album:addToCollection` 处理器
- **CSV 模块**：新增 `appendAlbumToCsv()` 函数支持追加单条记录
- **依赖**：复用现有 `NcmCliService.searchAlbum()` 方法
