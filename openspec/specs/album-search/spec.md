## Requirements

### Requirement: 搜索入口

系统 SHALL 在顶部工具栏提供「搜索专辑」按钮，点击后打开搜索弹窗。

#### Scenario: 打开搜索弹窗

- **WHEN** 用户点击工具栏中的「搜索专辑」按钮
- **THEN** 系统 SHALL 显示一个独立的搜索弹窗（Modal），包含搜索输入框和结果展示区域

#### Scenario: 关闭搜索弹窗

- **WHEN** 用户点击关闭按钮
- **THEN** 系统 SHALL 关闭搜索弹窗，清空搜索状态

### Requirement: 关键词搜索

系统 SHALL 支持用户输入关键词搜索网易云音乐的专辑库。

#### Scenario: 执行搜索

- **WHEN** 用户在搜索框中输入关键词并点击搜索按钮（或按回车）
- **THEN** 系统 SHALL 调用 ncm-cli 搜索专辑，返回最多 10 条匹配结果

#### Scenario: 搜索中状态

- **WHEN** 搜索请求正在进行中
- **THEN** 系统 SHALL 显示加载指示器，搜索按钮禁用

#### Scenario: 空关键词

- **WHEN** 用户未输入关键词就点击搜索
- **THEN** 系统 SHALL 不发起请求，提示用户输入关键词

### Requirement: 搜索结果展示

系统 SHALL 以列表形式展示搜索结果，每条结果包含封面、标题、艺术家信息。

#### Scenario: 结果列表渲染

- **WHEN** 搜索返回结果
- **THEN** 系统 SHALL 展示每张专辑的：封面图片、专辑标题、艺术家名称、发行时间

#### Scenario: 无结果

- **WHEN** 搜索未找到匹配专辑
- **THEN** 系统 SHALL 显示「未找到相关专辑」提示

#### Scenario: 搜索失败

- **WHEN** ncm-cli 调用失败（网络错误或未登录）
- **THEN** 系统 SHALL 显示错误提示，若为登录问题则引导用户登录

### Requirement: 添加到收藏

用户 SHALL 能够将搜索结果中的专辑添加到收藏列表。

#### Scenario: 添加未收藏专辑

- **WHEN** 用户点击某张未收藏专辑的「添加」按钮
- **THEN** 系统 SHALL 将该专辑写入 CSV 文件，触发同步流程，专辑出现在主列表中

#### Scenario: 添加成功反馈

- **WHEN** 专辑添加成功
- **THEN** 系统 SHALL 将该专辑的按钮状态更新为「已添加」（禁用状态）

#### Scenario: 添加失败

- **WHEN** CSV 写入或同步过程失败
- **THEN** 系统 SHALL 显示错误提示，按钮恢复可点击状态

### Requirement: 已收藏标识

系统 SHALL 在搜索结果中标识已收藏的专辑，防止重复添加。

#### Scenario: 标识已收藏专辑

- **WHEN** 搜索结果中的某张专辑已在用户收藏中（通过 netease_original_id 或 netease_album_id 匹配）
- **THEN** 系统 SHALL 将该专辑的按钮显示为「已收藏」（禁用状态），视觉上与未收藏专辑区分
