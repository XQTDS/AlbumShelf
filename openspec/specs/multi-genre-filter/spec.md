# Multi-Genre Filter Specification

多风格筛选功能，支持同时选择多个风格进行 AND 逻辑筛选。

## Requirements

### Requirement: 多风格选择
系统 SHALL 允许用户同时选择多个风格作为筛选条件。

#### Scenario: 添加风格到筛选条件
- **WHEN** 用户在风格输入框中输入文字并从自动完成列表中选择一个风格
- **THEN** 该风格被添加到已选风格列表中

#### Scenario: 添加重复风格
- **WHEN** 用户尝试添加已经在筛选条件中的风格
- **THEN** 系统不添加重复项，已选列表保持不变

### Requirement: AND 逻辑筛选
系统 SHALL 使用 AND 逻辑进行多风格筛选，只显示同时包含所有选中风格的专辑。

#### Scenario: 多风格 AND 筛选
- **WHEN** 用户选中 "Rock" 和 "Jazz" 两个风格
- **THEN** 系统只显示同时包含 Rock 和 Jazz 的专辑

#### Scenario: 单风格筛选
- **WHEN** 用户只选中一个风格 "Rock"
- **THEN** 系统显示所有包含 Rock 风格的专辑

#### Scenario: 无风格筛选
- **WHEN** 用户未选中任何风格
- **THEN** 系统显示所有专辑（不进行风格筛选）

### Requirement: 风格自动完成
系统 SHALL 在风格输入框中提供自动完成功能，根据用户输入显示匹配的风格建议。

#### Scenario: 输入匹配
- **WHEN** 用户在输入框中输入 "Ro"
- **THEN** 系统显示所有以 "Ro" 开头的风格（如 "Rock", "Rockabilly"）

#### Scenario: 无匹配结果
- **WHEN** 用户输入的文字没有匹配的风格
- **THEN** 系统不显示建议列表

#### Scenario: 已选风格不显示
- **WHEN** 用户输入文字时，某个匹配的风格已被选中
- **THEN** 该风格不出现在建议列表中

### Requirement: 已选风格展示
系统 SHALL 在工具栏区域显示当前已选中的风格标签。

#### Scenario: 显示已选风格
- **WHEN** 用户选中了 "Rock" 和 "Jazz"
- **THEN** 工具栏显示两个可见的风格标签 [Rock] [Jazz]

### Requirement: 移除单个风格
用户 SHALL 能够点击已选风格标签上的移除按钮来取消该风格的筛选。

#### Scenario: 点击移除按钮
- **WHEN** 用户点击 [Rock ✕] 标签上的 ✕ 按钮
- **THEN** "Rock" 从筛选条件中移除，专辑列表实时更新

### Requirement: 清除全部风格
系统 SHALL 提供一键清除所有已选风格的功能。

#### Scenario: 点击清除全部
- **WHEN** 用户点击 "清除全部" 按钮
- **THEN** 所有已选风格被清除，专辑列表显示所有专辑

#### Scenario: 无已选风格时隐藏清除按钮
- **WHEN** 没有选中任何风格
- **THEN** "清除全部" 按钮不显示

### Requirement: 专辑风格标签可点击
专辑列表和详情中的风格标签 SHALL 可点击，点击后切换该风格的筛选状态。

#### Scenario: 点击未选中的风格标签
- **WHEN** 用户点击专辑上未被选中的 "Rock" 风格标签
- **THEN** "Rock" 被添加到筛选条件中

#### Scenario: 点击已选中的风格标签
- **WHEN** 用户点击专辑上已被选中的 "Rock" 风格标签
- **THEN** "Rock" 从筛选条件中移除

### Requirement: 已选风格标签高亮
系统 SHALL 对已被选为筛选条件的风格标签使用不同的视觉样式进行高亮显示。

#### Scenario: 高亮显示
- **WHEN** "Rock" 在筛选条件中
- **THEN** 所有专辑上的 "Rock" 标签显示高亮样式（如不同背景色或边框）

#### Scenario: 普通显示
- **WHEN** "Jazz" 不在筛选条件中
- **THEN** 所有专辑上的 "Jazz" 标签显示普通样式
