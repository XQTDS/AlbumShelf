## ADDED Requirements

### Requirement: 进度条显示滚动位置

系统 SHALL 在滚动容器右侧显示一个垂直进度条，指示当前滚动位置相对于总内容高度的比例。

#### Scenario: 进度条位置更新

- **WHEN** 用户滚动列表内容
- **THEN** 进度条滑块位置 SHALL 实时更新，反映当前视口在总内容中的位置

#### Scenario: 内容未撑满容器

- **WHEN** 内容高度小于或等于容器高度（无需滚动）
- **THEN** 进度条 SHALL 隐藏或滑块占满整个轨道

### Requirement: 进度条视觉状态变化

系统 SHALL 根据滚动状态调整进度条的视觉呈现。

#### Scenario: 滚动时高亮

- **WHEN** 用户正在滚动列表
- **THEN** 进度条 SHALL 变得更加明显（如不透明度提高、颜色加深）

#### Scenario: 静止时淡化

- **WHEN** 用户停止滚动超过一定时间（如 1 秒）
- **THEN** 进度条 SHALL 淡化（如降低不透明度），但仍保持可见

### Requirement: 进度条支持拖动定位

系统 SHALL 支持通过拖动进度条滑块来快速滚动到目标位置。

#### Scenario: 拖动滑块滚动

- **WHEN** 用户按住进度条滑块并拖动
- **THEN** 列表内容 SHALL 同步滚动到对应位置

#### Scenario: 点击轨道跳转

- **WHEN** 用户点击进度条轨道的任意位置（非滑块区域）
- **THEN** 列表 SHALL 跳转到对应的滚动位置

### Requirement: 进度条样式

进度条 SHALL 具有细长、圆角的外观，宽度约 6px。

#### Scenario: 默认样式

- **WHEN** 进度条渲染时
- **THEN** 进度条轨道 SHALL 显示为细长的垂直条，滑块 SHALL 为圆角矩形
