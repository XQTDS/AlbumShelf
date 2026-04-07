## Why

我们需要一个桌面应用来管理个人收藏的音乐专辑。目前网易云音乐的收藏功能缺乏评分、风格标签等元数据，也无法按这些维度进行排序和筛选。AlbumShelf 将网易云收藏的专辑同步到本地，通过 MusicBrainz 补全评分和风格信息，并以可排序、可筛选的表格形式展示，让用户更好地浏览和管理自己的专辑收藏。

## What Changes

这是一个全新项目，从零开始构建：

- 新建 Electron + Vue 3 桌面应用工程
- 集成 ncm-cli 本地模块，实现从网易云音乐手动同步收藏专辑
- 集成 MusicBrainz API，新专辑入库后自动补全评分和风格标签
- 使用 SQLite 作为本地数据库，存储专辑、曲目、风格标签数据
- 构建列表视图 UI：表格展示专辑（序号、专辑名、艺术家、评分、风格、发行日期）
- 支持按艺术家和风格进行下拉筛选
- 支持按评分和发行日期进行升序/降序排序
- 支持按专辑名/艺术家关键词搜索

## Capabilities

### New Capabilities

- `data-sync`: 网易云音乐专辑收藏同步 —— 通过 ncm-cli 拉取网易云收藏专辑列表，增量更新到本地 SQLite 数据库
- `data-enrichment`: MusicBrainz 数据补全 —— 新专辑入库后自动通过 MusicBrainz API 匹配并补全评分和风格标签
- `local-storage`: 本地数据存储 —— SQLite 数据库设计，包含 Album、Track、Genre 三张表及其关联关系
- `album-list-ui`: 专辑列表界面 —— 表格形式展示专辑，支持按艺术家/风格筛选，按评分/发行日期排序，关键词搜索

### Modified Capabilities

（无 —— 这是全新项目）

## Impact

- **新增依赖**：Electron、Vue 3、SQLite（better-sqlite3 或 sql.js）、ncm-cli、MusicBrainz API 客户端
- **外部系统**：依赖网易云音乐（通过 ncm-cli）和 MusicBrainz API（需遵守速率限制：1 请求/秒）
- **文件系统**：SQLite 数据库文件存储在用户本地应用数据目录
- **网络**：同步和数据补全操作需要网络连接