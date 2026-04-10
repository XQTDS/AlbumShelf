## ADDED Requirements

### Requirement: 检查登录状态

系统 SHALL 提供检查当前网易云音乐登录状态的能力，返回是否已登录以及用户信息。

#### Scenario: 已登录状态

- **WHEN** 调用登录状态检查接口，且 ncm-cli 返回有效的用户信息
- **THEN** 系统 SHALL 返回 `{ isLoggedIn: true, user: { nickname, avatarUrl, userId } }`

#### Scenario: 未登录状态

- **WHEN** 调用登录状态检查接口，且 ncm-cli 返回未登录
- **THEN** 系统 SHALL 返回 `{ isLoggedIn: false, user: null }`

#### Scenario: 检查失败

- **WHEN** 调用登录状态检查接口，ncm-cli 执行失败（如网络错误）
- **THEN** 系统 SHALL 抛出错误，包含失败原因

### Requirement: 生成登录二维码

系统 SHALL 提供生成网易云音乐登录二维码的能力，返回二维码图片 URL 和用于轮询的 key。

#### Scenario: 成功生成二维码

- **WHEN** 调用生成二维码接口
- **THEN** 系统 SHALL 返回 `{ qrcodeUrl: string, key: string }`，qrcodeUrl 为可直接展示的二维码图片地址

#### Scenario: 生成失败

- **WHEN** 调用生成二维码接口，ncm-cli 执行失败
- **THEN** 系统 SHALL 抛出错误，包含失败原因

### Requirement: 检查扫码状态

系统 SHALL 提供检查二维码扫码状态的能力，支持轮询等待用户扫码确认。

#### Scenario: 等待扫码

- **WHEN** 用户尚未扫描二维码
- **THEN** 系统 SHALL 返回 `{ status: 'waiting' }`

#### Scenario: 已扫码待确认

- **WHEN** 用户已扫描二维码但尚未点击确认
- **THEN** 系统 SHALL 返回 `{ status: 'scanned' }`

#### Scenario: 登录成功

- **WHEN** 用户扫码并确认登录
- **THEN** 系统 SHALL 返回 `{ status: 'confirmed', user: { nickname, avatarUrl, userId } }`

#### Scenario: 二维码过期

- **WHEN** 二维码已过期（约 3 分钟）
- **THEN** 系统 SHALL 返回 `{ status: 'expired' }`

### Requirement: 退出登录

系统 SHALL 提供退出当前网易云音乐登录状态的能力。

#### Scenario: 成功退出

- **WHEN** 调用退出登录接口
- **THEN** 系统 SHALL 清除登录状态，后续状态检查返回未登录

#### Scenario: 退出失败

- **WHEN** 调用退出登录接口，ncm-cli 执行失败
- **THEN** 系统 SHALL 抛出错误，包含失败原因

### Requirement: 应用启动时检查登录状态

系统 SHALL 在应用启动时自动检查网易云音乐登录状态。

#### Scenario: 启动时已登录

- **WHEN** 应用启动，检测到已登录状态
- **THEN** 系统 SHALL 更新菜单栏显示用户昵称，不弹出登录提示

#### Scenario: 启动时未登录

- **WHEN** 应用启动，检测到未登录状态
- **THEN** 系统 SHALL 更新菜单栏显示"未登录"，并弹出登录引导弹窗

### Requirement: 窗口菜单栏显示登录状态

系统 SHALL 在窗口菜单栏新增「账户」菜单，显示当前登录状态。

#### Scenario: 已登录时的菜单

- **WHEN** 用户已登录
- **THEN** 菜单栏「账户」菜单 SHALL 显示为「账户: {用户昵称}」，子菜单包含「退出登录」选项

#### Scenario: 未登录时的菜单

- **WHEN** 用户未登录
- **THEN** 菜单栏「账户」菜单 SHALL 显示为「账户: 未登录」，子菜单包含「登录」选项

#### Scenario: 点击登录菜单项

- **WHEN** 用户点击「登录」菜单项
- **THEN** 系统 SHALL 打开登录弹窗，展示二维码

#### Scenario: 点击退出登录菜单项

- **WHEN** 用户点击「退出登录」菜单项
- **THEN** 系统 SHALL 执行退出登录，并更新菜单栏为未登录状态

### Requirement: 登录成功后触发同步

系统 SHALL 在用户登录成功后自动触发专辑数据同步。

#### Scenario: 登录后自动同步

- **WHEN** 用户通过扫码完成登录
- **THEN** 系统 SHALL 自动触发专辑列表同步流程，无需用户手动点击同步按钮
