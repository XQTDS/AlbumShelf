## Why

很多专辑在 MusicBrainz 自动补全后仍然缺少风格标签（匹配不到或 MB 上无 tags），用户目前没有任何手段手动为这些专辑添加或调整风格标签。需要提供一个就地编辑的入口，让用户可以从已有风格库中为专辑选择、调整和删除风格标签。

## What Changes

- 在专辑详情展开区的「风格」区域旁增加一个编辑按钮，点击后切换为编辑态
- 编辑态下：已有风格标签带 ✕ 可删除；提供输入框从已有风格库自动补全选择新标签；不支持创建新风格
- 提供「保存」和「取消」按钮，保存后调用后端持久化，取消恢复原状
- 新增 IPC handler `album:setGenres` 将编辑后的风格标签写入数据库
- 新增 preload API 类型定义

## Capabilities

### New Capabilities
- `manual-genre-edit`: 手动编辑专辑风格标签的能力，包括添加（从已有风格库选择）、删除风格标签，就地编辑交互

### Modified Capabilities
- `album-detail-expand`: 详情展开区新增风格标签编辑入口和编辑态 UI

## Impact

- **前端 App.vue**：详情展开区的风格区域新增编辑态（编辑按钮、标签输入框、自动补全、保存/取消）
- **IPC handlers**：新增 `album:setGenres` handler
- **Preload**：新增 `setAlbumGenres` API 类型定义
- **后端 AlbumService**：无需改动，复用已有 `setAlbumGenres()` 方法
- **数据库**：无需改动，已有 genre + album_genre 表结构
