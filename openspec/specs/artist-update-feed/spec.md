## Requirements

### Requirement: 检查关注艺术家的新专辑

系统 SHALL 提供对全部已关注艺术家的新专辑检查能力，通过 `ncm-cli artist songs` 按发布时间窗拉取歌曲流、按专辑聚合去重、补 `ncm-cli album get` 与 `album tracks` 后落库为动态条目。检查 SHALL 仅由用户手动触发。

#### Scenario: 手动触发检查

- **WHEN** 用户在关注列表窗口「动态」Tab 点击「立即检查」
- **THEN** 系统 SHALL 遍历全部关注艺术家执行检查，并通过 `artistUpdates:progress` 事件向**触发窗口**推送进度（当前序号 / 总数 / 艺人名）

#### Scenario: 仅手动触发

- **WHEN** 应用启动、用户登录成功、或任意后台时机到达
- **THEN** 系统 SHALL NOT 自动触发新专辑检查；系统 SHALL NOT 注册任何定时器执行该检查

#### Scenario: 唯一入口

- **WHEN** 用户查看应用菜单栏
- **THEN** 菜单 SHALL NOT 包含新专辑检查入口；该功能的触发入口 SHALL 仅存在于关注列表窗口的「动态」Tab 内

#### Scenario: 防重入

- **WHEN** 检查正在进行中再次触发
- **THEN** 系统 SHALL 拒绝本次触发并提示正在执行中

#### Scenario: 登录前置检查

- **WHEN** 触发检查时未登录网易云
- **THEN** 系统 SHALL 触发登录弹窗并中止检查，不执行任何批量调用

#### Scenario: 登录中途失效

- **WHEN** 检查过程中登录失效（ncm-cli 返回需要登录错误）
- **THEN** 系统 SHALL 弹登录窗并中止整轮检查，返回已处理的统计

#### Scenario: 调用限流

- **WHEN** 逐个执行 ncm-cli 调用
- **THEN** 系统 SHALL 在每次调用之间间隔 300ms（覆盖 `artist songs`、`album get`、`album tracks` 全部三类调用）

#### Scenario: 完成统计

- **WHEN** 检查完成
- **THEN** 系统 SHALL 返回并展示统计：关注艺人总数、新增「本人名下发行」数、新增「参与作品」数、因已入库跳过数、因缺加密 ID 跳过的艺人数、检查失败的艺人数

### Requirement: 可选回溯范围

系统 SHALL 允许用户选择本次检查的回溯范围（30 / 90 / 180 / 365 天，默认 90 天），实际扫描窗口 SHALL 取 `min(now - lookbackDays, 该艺人水位线)`。

#### Scenario: 至少扫描选中范围

- **WHEN** 某艺人的水位线晚于「now - 选中范围」（例如昨天刚检查过，用户选择「最近一年」）
- **THEN** 系统 SHALL 扫描完整的选中范围（一年），而非仅扫描水位线之后的增量

#### Scenario: 水位线更早时扫到水位线

- **WHEN** 某艺人的水位线早于「now - 选中范围」（例如半年未检查，用户选择「最近 30 天」）
- **THEN** 系统 SHALL 扫描到水位线（半年），不得漏掉空档期

#### Scenario: 首次检查

- **WHEN** 某艺人从未被检查过（水位线为空）
- **THEN** 系统 SHALL 扫描用户选中的范围

#### Scenario: 非法回溯值

- **WHEN** 渲染层传入不在白名单（30/90/180/365）内的回溯天数
- **THEN** 主进程 SHALL 回落到默认值 90，不得直接使用该值计算时间窗

### Requirement: 增量水位线

系统 SHALL 在 followed_artist 表维护 `last_checked_at` 水位线，并 SHALL 仅在该艺人本轮**完全成功**时推进。

#### Scenario: 成功推进

- **WHEN** 某艺人的歌曲流拉取与全部候选专辑处理均成功
- **THEN** 系统 SHALL 将该艺人的 `last_checked_at` 更新为本轮检查开始时间

#### Scenario: 失败不推进

- **WHEN** 某艺人的歌曲流拉取失败，或其任一候选专辑的详情 / 曲目拉取失败
- **THEN** 系统 SHALL NOT 推进该艺人的水位线，并将其计入失败数；下次检查 SHALL 从旧水位线重新覆盖该时间窗

#### Scenario: 水位线损坏

- **WHEN** 某艺人的 `last_checked_at` 无法解析为有效时间
- **THEN** 系统 SHALL 按首次检查处理（使用用户选中的回溯范围）

### Requirement: 候选专辑聚合与去重

系统 SHALL 将 `artist songs` 返回的歌曲流按 `album.id` 聚合为候选专辑，并在调用专辑详情前完成三级过滤。

#### Scenario: 空 album 守卫

- **WHEN** 歌曲的 `album` 字段缺失或缺少 `id`
- **THEN** 系统 SHALL 丢弃该歌曲，不参与专辑聚合

#### Scenario: 已入库专辑跳过

- **WHEN** 候选专辑的加密 ID 已存在于 album 表的 `netease_album_id`
- **THEN** 系统 SHALL 跳过该专辑且不产生动态条目，并计入「已入库跳过」数

#### Scenario: 已收录且完整的条目跳过

- **WHEN** 该艺人的该专辑已存在于 artist_update 且曲目信息完整
- **THEN** 系统 SHALL 零调用跳过，不重复拉取详情

#### Scenario: 落库幂等

- **WHEN** 同一艺人的同一专辑被重复检查到
- **THEN** 系统 SHALL 通过 `UNIQUE(artist_name, album_id)` 保证不产生第二行，且 SHALL NOT 覆盖已有行的已读状态

### Requirement: 动态条目分类

系统 SHALL 基于 `album get` 返回的专辑级 `artists` 数组，将每条动态分类为「本人名下发行」（own）或「参与作品」（participation）。

#### Scenario: 本人名下发行

- **WHEN** 专辑的 artists 首位是该关注艺人且艺术家总数不超过 2
- **THEN** 系统 SHALL 分类为 own

#### Scenario: 群星合辑

- **WHEN** 专辑的 artists 包含网易云「群星」实体（明文 ID 122455）
- **THEN** 系统 SHALL 分类为 participation

#### Scenario: 艺术家信息缺失

- **WHEN** 专辑的 artists 为空数组
- **THEN** 系统 SHALL 保守分类为 participation，避免把合辑误报为本人新专辑

#### Scenario: 无法区分新作与再版

- **WHEN** 专辑是精选集、Remastered 重发或单曲重新上架
- **THEN** 系统 SHALL 分类为 own（它们确实是本人名下、在该时间窗内发行），UI 文案 SHALL 使用「本人名下发行」而非「新作品」以匹配该语义

### Requirement: 曲目数与总时长

系统 SHALL 为每条动态记录专辑的曲目数与总时长，数据 SHALL 来自 `ncm-cli album tracks`。

#### Scenario: 数据来源约束

- **WHEN** 获取某专辑的曲目数与总时长
- **THEN** 系统 SHALL 调用 `album tracks` 并对返回歌曲数组取长度与 `duration` 求和
- **AND** 系统 SHALL NOT 从 `artist songs` 的聚合结果推算（该结果仅含该艺人在专辑中的歌曲，会将合辑误算为单曲）
- **AND** 系统 SHALL NOT 期望 `album get` 返回这两个字段（其返回体不含）

#### Scenario: 单曲可辨识

- **WHEN** 动态条目的曲目数为 1
- **THEN** UI SHALL 显示「1 首」及其时长，使用户可自行区分单曲与正式专辑
- **AND** 系统 SHALL NOT 因曲目数少而过滤该条目

#### Scenario: 曲目信息缺失降级

- **WHEN** `album tracks` 调用失败
- **THEN** 系统 SHALL 仍然落库该动态条目（曲目字段留空），并将该艺人标记为未完全成功（水位线不推进）
- **AND** UI SHALL 整段不渲染曲目信息，而非显示「0 首」

#### Scenario: 曲目信息自愈

- **WHEN** 某动态条目已存在但曲目信息为空（历史数据或上次拉取失败）
- **THEN** 下次检查 SHALL 仅补拉一次 `album tracks` 并 UPDATE 该行，跳过 `album get`，且 SHALL NOT 产生重复行

### Requirement: 动态信息流展示

系统 SHALL 在关注列表窗口以「关注 / 动态」双 Tab 呈现，动态 Tab 展示动态信息流。

#### Scenario: Tab 与未读计数

- **WHEN** 存在未读动态
- **THEN** 「动态」Tab 标题 SHALL 显示未读条数徽标

#### Scenario: 条目内容

- **WHEN** 动态流渲染一条动态
- **THEN** 条目 SHALL 展示：封面、专辑名、分类标签、曲目数与总时长、艺术家名、发行日期、未读圆点、网易云跳转按钮

#### Scenario: 排序

- **WHEN** 动态流排序
- **THEN** 系统 SHALL 按「未读优先 → 本人名下发行优先 → 发行日期倒序」排列，participation 条目 SHALL 弱化展示

#### Scenario: 封面加载

- **WHEN** 渲染未入库专辑的封面
- **THEN** 系统 SHALL 使用远程 https 直链（不写入 `cover://` 本地缓存）；加载失败 SHALL 回退占位符且不报错

#### Scenario: 上次检查提示

- **WHEN** 动态 Tab 打开
- **THEN** 工具条 SHALL 展示「上次检查：N 天前」（从未检查过时展示「尚未检查过」）

#### Scenario: 空状态

- **WHEN** 尚无任何动态条目
- **THEN** 系统 SHALL 展示引导文案，说明先选择回溯范围并执行检查，并提示范围越大耗时越久

### Requirement: 已读管理

系统 SHALL 支持动态条目的已读状态管理，未读数的语义 SHALL 为「上次检查之后的新发现」。

#### Scenario: 单条已读

- **WHEN** 用户点击某条未读动态
- **THEN** 系统 SHALL 将其标记为已读（乐观更新，未读数即时减一）并持久化

#### Scenario: 全部已读

- **WHEN** 用户点击「全部已读」
- **THEN** 系统 SHALL 将全部未读条目标记为已读并广播刷新

#### Scenario: 首次检查批次标记已读

- **WHEN** 某艺人从未被检查过，其本轮发现的条目落库
- **THEN** 系统 SHALL 将该批次条目直接标记为已读，避免首次使用时未读洪泛

#### Scenario: 回溯发现的历史条目标记未读

- **WHEN** 用户对已检查过的艺人选择更大的回溯范围，从而发现此前未收录的历史专辑
- **THEN** 系统 SHALL 将这些条目标记为未读（用户主动要求往回看，应当可见）

#### Scenario: 已读状态不被重跑冲掉

- **WHEN** 重复检查命中已存在的动态条目
- **THEN** 系统 SHALL 保留该行原有的已读状态

### Requirement: 跳转到网易云

系统 SHALL 为每条动态提供跳转到网易云音乐专辑页的入口。

#### Scenario: 跳转

- **WHEN** 用户点击动态条目的网易云跳转按钮
- **THEN** 系统 SHALL 通过 `shell.openExternal` 在系统默认浏览器打开 `https://music.163.com/#/album?id=<明文专辑 ID>`，并将该条目标记为已读

#### Scenario: 明文 ID 缺失

- **WHEN** 动态条目的明文专辑 ID 为空
- **THEN** 系统 SHALL 不渲染跳转按钮，而非报错

#### Scenario: 入库闭环

- **WHEN** 用户经跳转在网易云收藏该专辑，随后执行手动同步
- **THEN** 该专辑 SHALL 进入本地专辑库，且后续检查 SHALL 因「已入库」跳过该条目

### Requirement: 缺加密艺人 ID 的处理

系统 SHALL 跳过缺少加密艺人 ID 的关注记录，并在完成统计中告知用户。

#### Scenario: 跳过并计数

- **WHEN** 某关注艺术家的 `encrypted_id` 为空
- **THEN** 系统 SHALL 跳过该艺人（`artist songs` 只接受加密 ID）并计入「缺 ID 跳过」数
- **AND** 系统 SHALL NOT 静默忽略——完成统计 SHALL 展示该数量

### Requirement: 跨窗口同步

系统 SHALL 在动态数据变更后向所有窗口广播 `artist-updates:changed`。

#### Scenario: 变更广播

- **WHEN** 检查完成、条目被标记已读、或取关导致级联清理
- **THEN** 系统 SHALL 广播 `artist-updates:changed`，已打开的关注列表窗口 SHALL 刷新动态流与未读计数
