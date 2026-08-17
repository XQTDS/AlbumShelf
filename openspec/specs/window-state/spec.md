# window-state Spec

## Requirements

### Requirement: 窗口状态持久化

系统 SHALL 在窗口关闭时将窗口状态保存到 Electron userData 目录下的 `window-state.json` 文件中。

#### Scenario: 保存内容

- **WHEN** 主窗口关闭
- **THEN** 系统 SHALL 保存窗口的 x、y、width、height（非最大化边界，通过 `getNormalBounds()` 获取）与 isMaximized 状态到 `window-state.json`

#### Scenario: 最大化关闭

- **WHEN** 窗口处于最大化状态时被关闭
- **THEN** 系统 SHALL 保存还原后的正常边界与 `isMaximized: true`

### Requirement: 窗口状态恢复

系统 SHALL 在启动时读取 `window-state.json`，若存在有效状态则以保存的状态创建窗口，否则使用默认尺寸 1200×800。

#### Scenario: 正常恢复

- **WHEN** 应用启动且 `window-state.json` 包含有效状态
- **THEN** 系统 SHALL 以保存的 x、y、width、height 创建主窗口，且 width/height 不小于 minWidth(900)/minHeight(600)

#### Scenario: 最大化恢复

- **WHEN** 保存的状态中 `isMaximized` 为 true
- **THEN** 系统 SHALL 在窗口显示前将其最大化

#### Scenario: 首次启动

- **WHEN** `window-state.json` 不存在
- **THEN** 系统 SHALL 使用默认尺寸 1200×800 创建窗口

#### Scenario: 文件损坏

- **WHEN** `window-state.json` 内容无法解析或字段缺失/类型不符
- **THEN** 系统 SHALL 回退到默认尺寸，不中断启动

### Requirement: 屏幕外位置防护

系统 SHALL 校验保存的窗口位置在当前显示器环境中可见，不可见时回退到默认尺寸。

#### Scenario: 显示器环境变化

- **WHEN** 保存的窗口边界与所有显示器的 workArea 交集均小于 100×100（如显示器被拔出）
- **THEN** 系统 SHALL 忽略保存的位置与尺寸，使用默认尺寸 1200×800 创建窗口
