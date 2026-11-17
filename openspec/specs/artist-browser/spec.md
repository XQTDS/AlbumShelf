## Requirements

### Requirement: 艺人目录聚合

系统 SHALL 从库内专辑聚合全部艺人，数据真源为 `album.artists` 结构化 JSON；当 `artists` 为 NULL、损坏或为空时 SHALL 回退拆分 `album.artist` 文本。收录条件仅为「至少参与一张库内专辑」，SHALL NOT 以是否匹配 MusicBrainz、是否有 `artist` 行、是否有地区作为过滤条件。

#### Scenario: 无 MB 匹配的艺人

- **WHEN** 某艺人只出现在没有 `musicbrainz_id` 的专辑中
- **THEN** 该艺人 SHALL 出现在艺人目录中
- **AND** 其地区无数据时 SHALL 显示「—」，SHALL NOT 隐藏该艺人

#### Scenario: 仅合作艺人

- **WHEN** 某艺人只以非第一艺术家身份出现在合作专辑中，且没有 `artist` 行
- **THEN** 该艺人 SHALL 出现在艺人目录中
- **AND** 其专辑数 SHALL 包含该合作专辑

#### Scenario: 不列出空艺人

- **WHEN** `artist` 表存在某行，但库内没有任何专辑引用该艺人
- **THEN** 该艺人 SHALL NOT 出现在艺人目录中

#### Scenario: 身份键

- **WHEN** 系统归并艺人身份
- **THEN** SHALL 优先使用 `artists[].originalId > 0` 作为身份键
- **AND** `originalId` 缺失或为 0 时 SHALL 回退加密 ID；再缺失时回退归一化名字
- **AND** 同一身份在同一专辑内重复出现 SHALL 只计一次
- **AND** 同名不同 ID 的艺人 SHALL 分列为不同条目
- **AND** 无 ID 的名字桶或仅有加密 ID 的桶，仅当名字唯一对应一个 `netease:` 身份时 SHALL 合并进去；有歧义时 SHALL 保留独立条目

#### Scenario: 同 ID 多名

- **WHEN** 同一网易云艺人 ID 在不同专辑中使用不同展示名
- **THEN** 系统 SHALL 合并为一个艺人条目
- **AND** 展示名 SHALL 优先使用 `artist.name`，缺失时使用出现次数最多的名字
- **AND** 其余名字 SHALL 作为别名展示

### Requirement: 艺人列表展示

系统 SHALL 在独立窗口左栏展示艺人列表，每项包含艺人名、地区、专辑数与平均评分，并支持按名称/别名搜索和排序。

#### Scenario: 行内容

- **WHEN** 艺人目录加载完成
- **THEN** 每个艺人行 SHALL 展示艺人名、地区（无数据「—」/不渲染 chip）、专辑数、平均评分
- **AND** 平均评分 SHALL 附已评分张数 / 总专辑数，例如 `★ 4.2 (7/28)`
- **AND** 无任何已评分专辑时平均评分 SHALL 显示「—」，SHALL NOT 显示 0

#### Scenario: 搜索

- **WHEN** 用户在搜索框输入关键词
- **THEN** 列表 SHALL 在本地按艺人名与别名做不区分大小写的包含匹配
- **AND** SHALL 显示「共 N 位 · 命中 M 位」

#### Scenario: 排序

- **WHEN** 用户选择排序方式
- **THEN** 系统 SHALL 支持「专辑数降序（默认）/ 名字 A-Z / 平均评分降序」
- **AND** 平均评分排序时无评分艺人 SHALL 排在最后
- **AND** 合成艺人（群星/Various Artists/合辑）在所有排序下 SHALL 排在真人之后

#### Scenario: 空状态

- **WHEN** 库内没有任何专辑
- **THEN** 窗口 SHALL 显示引导先同步专辑列表的空态
- **WHEN** 搜索无结果
- **THEN** 窗口 SHALL 显示「没有匹配的艺人」

### Requirement: 艺人详情统计

系统 SHALL 在右栏展示选中艺人的专辑数、平均评分与地区；统计口径 SHALL 与专辑列表一致。

#### Scenario: 专辑数

- **WHEN** 计算艺人专辑数
- **THEN** SHALL 统计该身份出现过的 distinct album 数，任意 `artists` 成员出现均计入（any-credit）
- **AND** 同一专辑重复 credit SHALL 只计一次
- **AND** 详情可额外展示「主 N · 参与 M」，但总数 SHALL 与专辑列表条数一致

#### Scenario: 平均评分

- **WHEN** 统计艺人平均评分
- **THEN** SHALL 仅对该艺人全部专辑中 `user_rating IS NOT NULL` 的专辑求算术平均，保留 1 位小数
- **AND** SHALL 同时展示已评分张数 / 总专辑数，例如「平均评分 4.0（3 / 4 张已评）」
- **AND** 零张已评时 SHALL 显示「—」
- **AND** SHALL NOT 把未评分专辑按 0 计入，SHALL NOT 混入 MusicBrainz 评分

### Requirement: 艺人专辑列表

系统 SHALL 在艺人详情下方展示该艺人的全部专辑，每条包含封面、专辑名与我的评分。

#### Scenario: 专辑条目

- **WHEN** 选中一位艺人
- **THEN** 专辑列表 SHALL 展示该艺人参与的全部专辑，每条含封面、专辑名、我的评分
- **AND** 未评分专辑 SHALL 显示「—」
- **AND** 非主艺人专辑 SHALL 标注「合作」
- **AND** 可附加发行日期与完整艺术家文本
- **AND** 列表条数 SHALL 等于该艺人详情的专辑数

#### Scenario: 排序

- **WHEN** 展示专辑列表
- **THEN** SHALL 按发行日期降序排列，无日期排最后，同日期按专辑 id 降序

#### Scenario: 封面回退

- **WHEN** 专辑有 `cover_url`
- **THEN** SHALL 优先通过 `cover://album/<id>` 加载本地缓存封面
- **AND** 协议失败时 SHALL 回退远程 `cover_url`
- **AND** 远程也失败或地址为空时 SHALL 显示 💿 占位符

### Requirement: 点击专辑跳转主界面详情

系统 SHALL 支持点击艺人专辑列表中的专辑，在主界面直接选中该专辑并打开详情面板。

#### Scenario: 专辑已在当前列表

- **WHEN** 目标专辑已在主窗口当前 `albums` 列表中
- **THEN** 系统 SHALL 设置选中状态并滚动定位到该专辑
- **AND** SHALL NOT 改变主窗口现有搜索/筛选/排序条件

#### Scenario: 专辑被筛掉或未加载

- **WHEN** 目标专辑不在主窗口当前列表中
- **THEN** 系统 SHALL 清空所有影响结果集包含性的条件：搜索词、艺术家精确筛选、艺术家部分匹配、风格筛选、地区筛选、已关注开关
- **AND** SHALL 取消搜索防抖、重置分页、一次加载完整结果集
- **AND** 找到目标后 SHALL 选中并滚动定位
- **AND** 排序、视图模式、角标开关与播放状态 SHALL 保留

#### Scenario: 主窗口聚焦

- **WHEN** 用户点击艺人窗口中的专辑
- **THEN** 系统 SHALL 恢复（最小化时）/显示/聚焦主窗口
- **AND** 艺人窗口 SHALL 保持打开，便于连续浏览

#### Scenario: 目标专辑已删除

- **WHEN** 目标专辑已被同步删除
- **THEN** 系统 SHALL 提示「该专辑已不在库中」且 SHALL NOT 打开空详情
- **AND** 艺人窗口 SHALL 刷新当前艺人专辑列表

#### Scenario: 主窗口不可用

- **WHEN** 主窗口不存在或已销毁
- **THEN** 系统 SHALL 返回明确错误提示，艺人窗口 SHALL 保持可用

### Requirement: 独立窗口与入口

系统 SHALL 通过菜单「工具 → 艺人信息」打开独立的艺人信息窗口。

#### Scenario: 打开窗口

- **WHEN** 用户点击菜单「工具 → 艺人信息」
- **THEN** 系统 SHALL 打开独立 BrowserWindow（左艺人列表、右艺人详情）
- **AND** 窗口 SHALL 为单实例：已打开时 SHALL 聚焦现有窗口，SHALL NOT 重复创建
- **AND** 窗口 SHALL 隐藏菜单栏，Esc 关闭

#### Scenario: 窗口尺寸

- **WHEN** 窗口创建
- **THEN** 默认尺寸 SHALL 约为 900×660，最小尺寸 SHALL 为 720×520
- **AND** 不要求持久化窗口位置与尺寸（沿用关注窗口现状）

#### Scenario: 生产构建

- **WHEN** 执行生产构建
- **THEN** `electron.vite.config.ts` SHALL 注册 `artists` 多页面入口
- **AND** 打包产物 SHALL 包含 `out/renderer/artists.html`

### Requirement: 手动修改艺人地区

系统 SHALL 允许在艺人详情中手动设置或清除艺人地区；这是艺人信息窗口唯一的写操作。

#### Scenario: 设置地区

- **WHEN** 用户点击艺人地区旁的编辑按钮并选择一个地区后保存
- **THEN** 系统 SHALL 写入 `artist.region` 与 `artist.country`（同一 ISO 代码），清空 `artist.area`
- **AND** SHALL 将 `artist.region_source` 置为 `'manual'`
- **AND** 艺人窗口的地区 chip SHALL 立即更新

#### Scenario: 清除地区

- **WHEN** 用户选择「清除地区」并保存
- **THEN** 系统 SHALL 将 `region` / `country` / `area` 置为 NULL，并保持 `region_source = 'manual'`
- **AND** 界面 SHALL 显示「—」
- **AND** 后续自动补全 SHALL NOT 回填该地区

#### Scenario: 自动补全不覆盖

- **WHEN** `artist.region_source = 'manual'`
- **THEN** MusicBrainz 地区补全、启动迁移合并与数据导入 SHALL NOT 覆盖 `region` / `country` / `area` / `region_source`
- **AND** 手动设置的值 SHALL 在「重新补全所有专辑」后保持不变

#### Scenario: 无 artist 行的艺人

- **WHEN** 用户为只在合作专辑中出现、尚无 `artist` 行的艺人设置地区
- **THEN** 系统 SHALL 按网易云艺人 ID 新建 `artist` 行并写入地区
- **AND** 该艺人在库内的所有专辑 SHALL 继续出现在其艺人详情中

#### Scenario: 无网易云 ID 的艺人

- **WHEN** 艺人身份没有网易云明文 ID（仅旧备份文本拆分可能出现）
- **THEN** 地区编辑按钮 SHALL 禁用并提示「该艺人未关联网易云 ID，暂不支持修改地区」
- **AND** 主进程 SHALL 拒绝无 `netease:` 键的写请求

#### Scenario: 地区选项

- **WHEN** 打开地区选择器
- **THEN** 候选 SHALL 包含标准 ISO 3166-1 alpha-2 地区与库中已有地区
- **AND** 标签 SHALL 复用主进程 `regionLabel` 的中文展示口径
- **AND** 支持按中文标签或地区代码搜索

#### Scenario: 主窗口同步

- **WHEN** 手动地区保存成功
- **THEN** 主进程 SHALL 广播 `artist-region:changed`
- **AND** 主窗口 SHALL 更新当前已加载专辑中该主艺人的地区 chip，并刷新地区筛选项
- **AND** 当前地区筛选生效时 SHALL 按新地区重新加载列表

### Requirement: 刷新与状态

系统 SHALL 在窗口打开时加载数据，并在窗口重新获得焦点时静默刷新，同时提供手动刷新入口。

#### Scenario: 获焦刷新

- **WHEN** 艺人窗口重新获得焦点
- **THEN** 系统 SHALL 重新拉取艺人摘要与当前艺人专辑
- **AND** SHALL 保留搜索词与当前选中艺人（选中艺人已不存在时选择列表第一项）

#### Scenario: 手动刷新

- **WHEN** 用户点击刷新按钮
- **THEN** 系统 SHALL 重新拉取艺人摘要与当前艺人专辑

#### Scenario: 加载失败

- **WHEN** 艺人列表或专辑列表加载失败
- **THEN** 窗口 SHALL 显示错误信息与重试按钮
- **AND** 局部失败 SHALL NOT 使整个窗口不可用

#### Scenario: 请求竞态

- **WHEN** 用户快速连续切换艺人
- **THEN** 系统 SHALL 只应用最后一次请求的专辑结果，旧响应 SHALL NOT 覆盖新选择