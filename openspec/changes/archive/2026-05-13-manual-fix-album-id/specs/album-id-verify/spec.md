## ADDED Requirements

### Requirement: 单张专辑手动指定网易云 ID 入口

系统 SHALL 在专辑详情展开面板提供「修改网易云 ID」按钮，用户点击后可针对该专辑手动指定一个新的 `netease_album_id` 并触发完整重同步。

#### Scenario: 入口位置

- **WHEN** 用户展开任意一张专辑的详情面板
- **THEN** 系统 SHALL 在「重新同步」按钮旁展示「修改网易云 ID」按钮

#### Scenario: 触发弹窗

- **WHEN** 用户点击「修改网易云 ID」按钮
- **THEN** 系统 SHALL 弹出 `ManualFixIdModal`，预填当前专辑的 title / artist / 现 `netease_album_id`

### Requirement: 新 ID 输入与远程预览

系统 SHALL 要求用户输入 32 位加密 album ID，并在执行修复前必须先成功预览远程详情。

#### Scenario: 输入新 ID 并查询

- **WHEN** 用户在输入框中粘贴新的 32 位加密 album ID 并点击「查询」
- **THEN** 系统 SHALL 调用 `album:getDetailById` 拉取远程详情，展示远程 `name` / `artists` / `coverImgUrl`

#### Scenario: 查询失败

- **WHEN** 远程详情查询失败（无效 ID、网络错误等）
- **THEN** 系统 SHALL 在弹窗内展示错误信息，「确认修复」按钮 SHALL 保持禁用

#### Scenario: 未预览不允许修复

- **WHEN** 用户未成功获得远程预览
- **THEN** 「确认修复」按钮 SHALL 处于禁用状态

### Requirement: 复用现有修复链路

系统 SHALL 复用现有 `album:fixId` IPC 完成全部副作用：更新 `netease_album_id` / `netease_original_id` / `title`、清旧曲目并重拉、重新获取封面、回写 CSV。

#### Scenario: 用户确认修复

- **WHEN** 用户点击「确认修复」按钮
- **THEN** 系统 SHALL 调用 `album:fixId`，传入当前 albumId 与远程预览返回的 `id` / `originalId` / `name`

#### Scenario: 修复成功反馈

- **WHEN** `album:fixId` 返回成功
- **THEN** 系统 SHALL 关闭弹窗，并使用后端返回的最新 album 数据原地更新该行的封面 / title / 曲目缓存

#### Scenario: 修复失败反馈

- **WHEN** `album:fixId` 返回失败（如新 ID 与其他专辑冲突）
- **THEN** 系统 SHALL 在弹窗内展示错误信息，弹窗保持打开供用户修正

### Requirement: 修复成功后返回完整 album

`album:fixId` IPC SHALL 在成功时附带更新后的完整 album 数据（含 genres），便于前端原地刷新而无需重新拉取列表。

#### Scenario: 返回结构

- **WHEN** `album:fixId` 成功
- **THEN** 返回值的 `data` 字段 SHALL 包含 `album` 字段，结构与 `album:resync` 返回的 `album` 一致
