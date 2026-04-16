## ADDED Requirements

### Requirement: 无限滚动加载

系统 SHALL 在用户滚动到列表底部附近时自动加载更多专辑。

#### Scenario: 触发加载更多

- **WHEN** 用户滚动列表，接近底部（如距离底部 200px 以内）
- **AND** 还有更多专辑未加载
- **THEN** 系统 SHALL 自动请求并追加下一批专辑到列表末尾

#### Scenario: 加载中状态

- **WHEN** 系统正在加载更多专辑
- **THEN** 列表底部 SHALL 显示加载指示器（如 spinner）

#### Scenario: 全部加载完成

- **WHEN** 所有专辑已加载完毕
- **THEN** 系统 SHALL 不再触发加载，加载指示器 SHALL 隐藏

### Requirement: 表头固定

系统 SHALL 在滚动列表内容时保持表头固定在顶部可见。

#### Scenario: 滚动时表头可见

- **WHEN** 用户向下滚动专辑列表
- **THEN** 表头（# | 专辑 | 艺术家 | ...）SHALL 始终固定在表格区域顶部，不随内容滚动

### Requirement: 筛选/排序重置列表

系统 SHALL 在筛选或排序条件变化时重置已加载的专辑列表。

#### Scenario: 条件变化重置

- **WHEN** 用户更改筛选条件（艺术家、风格、搜索关键词）或排序方式
- **THEN** 系统 SHALL 清空已加载的专辑列表，重新从第一批开始加载

### Requirement: 隐藏原生滚动条

系统 SHALL 隐藏表格区域的原生滚动条，改用自定义进度条组件。

#### Scenario: 原生滚动条不可见

- **WHEN** 表格区域可滚动
- **THEN** 原生浏览器滚动条 SHALL 不显示

## REMOVED Requirements

### Requirement: 分页展示

**Reason**: 被无限滚动功能替代，提供更流畅的浏览体验

**Migration**: 用户无需手动翻页，滚动到底部时自动加载更多内容
