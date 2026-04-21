## ADDED Requirements

### Requirement: 点击专辑行展开详情区域

用户 SHALL 能够点击专辑表格中的任意一行，在该行下方展开一个详情区域，展示完整的专辑信息。

#### Scenario: 点击未展开的行
- **WHEN** 用户点击一个未展开的专辑行
- **THEN** 该行下方展开一个详情区域，展示完整的专辑信息

#### Scenario: 点击已展开的行
- **WHEN** 用户点击一个已展开的专辑行
- **THEN** 该行的详情区域收起

#### Scenario: 手风琴模式
- **WHEN** 用户在一行已展开的状态下点击另一行
- **THEN** 当前展开的行自动收起，新点击的行展开

### Requirement: 详情区域展示完整专辑信息

展开的详情区域 SHALL 包含以下内容：

- 封面图（来自 cover_url，无封面时显示占位符）
- 所有风格标签（完整展示，不截断），旁边带有 ✏️ 编辑按钮可进入就地编辑态
- MusicBrainz 外部链接（基于 musicbrainz_id，字段为空时不显示）
- 网易云音乐外部链接（基于 netease_id）
- 评分人数（mb_rating_count）
- 曲目数（track_count）
- 同步时间（synced_at）
- 补全时间（enriched_at，未补全时显示"未补全"）

#### Scenario: 完整数据展示
- **WHEN** 用户展开一个已补全的专辑行
- **THEN** 详情区域显示封面图、所有风格标签（旁边有编辑按钮）、MusicBrainz 链接、网易云链接、评分人数、曲目数、同步时间和补全时间

#### Scenario: 部分数据缺失
- **WHEN** 用户展开一个未补全或部分数据为空的专辑行
- **THEN** 缺失字段使用"—"或"未补全"等占位文字，MusicBrainz 链接在 musicbrainz_id 为空时不显示，封面图为空时显示占位符，风格区域显示"—"但仍然提供编辑按钮

### Requirement: 展开收起带有平滑过渡动画

详情区域的展开和收起 SHALL 有平滑的过渡动画效果。

#### Scenario: 展开动画
- **WHEN** 用户点击行触发展开
- **THEN** 详情区域从高度 0 平滑过渡到完整高度

#### Scenario: 收起动画
- **WHEN** 用户点击行触发收起
- **THEN** 详情区域从完整高度平滑过渡到高度 0

### Requirement: 外部链接在系统浏览器中打开

点击 MusicBrainz 链接或网易云音乐链接 SHALL 通过系统默认浏览器打开，而非在 Electron 应用内打开。

#### Scenario: 点击外部链接
- **WHEN** 用户点击详情区域中的 MusicBrainz 链接或网易云链接
- **THEN** 系统默认浏览器打开对应的 URL

### Requirement: 详情区域展示曲目列表

展开的详情区域 SHALL 展示该专辑的所有曲目，按碟片号和曲目号顺序排列，每首曲目显示基本信息。

#### Scenario: 展开后加载曲目

- **WHEN** 用户展开一个专辑的详情区域
- **THEN** 系统 SHALL 通过 `track:listByAlbum` 接口获取该专辑的曲目列表，并在详情区域中渲染

#### Scenario: 曲目信息展示

- **WHEN** 曲目列表加载完成且有曲目数据
- **THEN** 每首曲目 SHALL 展示以下信息：曲目序号（`track_number`）、标题（`title`）、艺术家（`artist`，为空时显示"—"）、时长（`duration_ms` 格式化为 `m:ss`，为空时显示"—"）

#### Scenario: 多碟专辑分组展示

- **WHEN** 专辑的曲目包含多个不同的 `disc_number`
- **THEN** 系统 SHALL 按碟片号分组展示，每组前显示 "Disc 1"、"Disc 2" 等分组标题

#### Scenario: 单碟专辑不显示碟片标题

- **WHEN** 专辑的所有曲目 `disc_number` 均为 1
- **THEN** 系统 SHALL 不显示碟片分组标题，直接展示曲目列表

#### Scenario: 无曲目数据

- **WHEN** 曲目列表为空（该专辑没有任何曲目记录）
- **THEN** 详情区域 SHALL 显示"暂无曲目信息"占位提示

#### Scenario: 曲目缓存

- **WHEN** 用户收起后再次展开同一专辑
- **THEN** 系统 SHALL 使用已缓存的曲目数据，不再重复请求

### Requirement: 展开详情时自动补全曲目数据

#### Scenario: 本地无曲目数据时自动从远程拉取

- **WHEN** `track:listByAlbum` 被调用，该专辑的 track 表记录为空，且专辑有有效的 `netease_album_id`
- **THEN** 系统 SHALL 自动调用曲目同步服务从 ncm-cli 拉取该专辑的曲目，写入 track 表后返回结果

#### Scenario: 本地已有曲目数据

- **WHEN** `track:listByAlbum` 被调用，该专辑的 track 表已有记录
- **THEN** 系统 SHALL 直接返回本地数据，不触发远程拉取

#### Scenario: 远程拉取失败

- **WHEN** 自动拉取曲目时 ncm-cli 调用失败
- **THEN** 系统 SHALL 返回空曲目列表，前端显示"暂无曲目信息"
