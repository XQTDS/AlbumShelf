## ADDED Requirements

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