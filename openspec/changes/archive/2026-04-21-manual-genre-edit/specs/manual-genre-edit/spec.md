## ADDED Requirements

### Requirement: 风格编辑入口

用户 SHALL 能够在专辑详情展开区的「风格」区域看到一个编辑按钮，点击后进入编辑态。

#### Scenario: 显示编辑按钮

- **WHEN** 用户展开某张专辑的详情区域
- **THEN** 「风格」label 旁 SHALL 显示一个 ✏️ 编辑按钮

#### Scenario: 点击编辑按钮进入编辑态

- **WHEN** 用户点击风格区域的编辑按钮
- **THEN** 风格区域 SHALL 切换为编辑态，显示当前风格标签（带 ✕ 删除按钮）、风格输入框、保存按钮和取消按钮

#### Scenario: 同一时间只编辑一个专辑

- **WHEN** 用户正在编辑专辑 A 的风格，又点击专辑 B 的编辑按钮
- **THEN** 专辑 A 的编辑态 SHALL 自动取消（丢弃未保存的更改），专辑 B 进入编辑态

### Requirement: 从已有风格库选择添加标签

用户 SHALL 能够通过自动补全输入框从已有风格库中选择风格标签添加到当前专辑。

#### Scenario: 输入筛选显示匹配风格

- **WHEN** 用户在编辑态输入框中输入文字
- **THEN** 系统 SHALL 显示下拉列表，列出所有名称匹配（不区分大小写）的已有风格

#### Scenario: 点选风格添加

- **WHEN** 用户从下拉列表中点击一个风格
- **THEN** 该风格 SHALL 被添加到编辑中的风格列表，输入框清空，下拉列表关闭

#### Scenario: 已选风格不重复显示

- **WHEN** 用户输入文字时，某个匹配的风格已在编辑列表中
- **THEN** 该风格 SHALL NOT 出现在下拉列表中

#### Scenario: 无匹配结果

- **WHEN** 用户输入的文字没有匹配任何已有风格
- **THEN** 下拉列表 SHALL 不显示

#### Scenario: 不支持创建新风格

- **WHEN** 用户在输入框中输入一个不存在于风格库中的文字并按回车
- **THEN** 系统 SHALL NOT 创建新风格，输入框保持不变

### Requirement: 删除风格标签

用户 SHALL 能够在编辑态中删除已有的风格标签。

#### Scenario: 点击删除按钮

- **WHEN** 用户点击编辑态中某个风格标签上的 ✕ 按钮
- **THEN** 该风格 SHALL 从编辑中的风格列表中移除

#### Scenario: 删除所有标签

- **WHEN** 用户删除了所有风格标签
- **THEN** 编辑列表 SHALL 为空，保存后该专辑将没有风格标签

### Requirement: 保存风格编辑

用户 SHALL 能够点击保存按钮将编辑后的风格标签持久化到数据库。

#### Scenario: 点击保存

- **WHEN** 用户在编辑态中点击「保存」按钮
- **THEN** 系统 SHALL 调用后端 `album:setGenres` 接口，将编辑后的风格列表写入数据库，成功后退出编辑态，专辑列表中该专辑的风格标签实时更新

#### Scenario: 保存失败

- **WHEN** 调用后端保存风格标签失败
- **THEN** 系统 SHALL 显示错误提示，保持编辑态不退出，用户可重试或取消

### Requirement: 取消风格编辑

用户 SHALL 能够点击取消按钮放弃编辑。

#### Scenario: 点击取消

- **WHEN** 用户在编辑态中点击「取消」按钮
- **THEN** 系统 SHALL 丢弃所有未保存的更改，恢复为编辑前的风格标签，退出编辑态

### Requirement: 风格编辑后端接口

系统 SHALL 提供 IPC handler `album:setGenres` 用于持久化专辑的风格标签。

#### Scenario: 设置风格标签

- **WHEN** 前端调用 `album:setGenres(albumId, genres[])` 接口
- **THEN** 系统 SHALL 调用 `AlbumService.setAlbumGenres()` 替换该专辑的所有风格关联，返回操作结果

#### Scenario: 专辑不存在

- **WHEN** 前端调用 `album:setGenres` 传入不存在的 albumId
- **THEN** 系统 SHALL 返回错误信息
