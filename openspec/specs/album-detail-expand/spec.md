## Requirements

### Requirement: 点击专辑行选中/取消选中专辑

用户 SHALL 能够点击专辑表格中的任意一行，在右侧常驻面板中展示该专辑的完整详情。

#### Scenario: 点击未选中的行
- **WHEN** 用户点击一个未选中的专辑行
- **THEN** 常驻面板展示该专辑的完整详情（表格布局不发生任何变化）

#### Scenario: 点击已选中的行
- **WHEN** 用户点击当前已选中的专辑行
- **THEN** 取消选中，面板回到占位态

#### Scenario: 面板打开时切换专辑
- **WHEN** 面板展示某专辑详情时，用户点击另一个专辑行
- **THEN** 面板内容直接刷新为新专辑的详情（无任何动画）

#### Scenario: 选中行高亮
- **WHEN** 一张专辑被选中
- **THEN** 该行 SHALL 保持高亮样式，作为当前选中指示

### Requirement: 播放条封面选中专辑

用户 SHALL 能够点击底部播放条最左侧的专辑封面，使详情面板展示当前播放专辑的信息。

#### Scenario: 专辑在当前列表中

- **WHEN** 播放会话存活且当前列表包含播放中的专辑，用户点击播放条封面
- **THEN** 面板 SHALL 直接选中该专辑并展示详情（布局不变），不滚动列表

#### Scenario: 专辑被过滤出列表

- **WHEN** 当前播放专辑被搜索/筛选/分页过滤出列表，用户点击播放条封面
- **THEN** 系统 SHALL 清除搜索词/艺术家筛选/风格筛选/排序条件，重置分页并持续加载直到找到该专辑，滚动定位后选中展示详情

### Requirement: 常驻面板布局

详情面板 SHALL 常驻于主界面右侧：恒定宽度（约占窗口的 1/3 到 1/2，`clamp(360px, 40vw, 620px)`），从工具栏以下开始，始终可见。面板的选中/取消选中/内容切换 SHALL 不引起列表布局的任何变化。

#### Scenario: 面板始终可见
- **WHEN** 应用加载出专辑列表
- **THEN** 右侧面板 SHALL 始终占据固定宽度显示（未选中专辑时显示占位态）

#### Scenario: 列表布局恒定
- **WHEN** 用户选中、取消选中或在专辑间切换
- **THEN** 左侧表格的宽度和列表项位置 SHALL 保持完全不变

#### Scenario: 工具栏不受遮挡
- **WHEN** 面板显示
- **THEN** 顶部工具栏（搜索框、筛选器等）SHALL 保持完整可见可用

### Requirement: 占位态

未选中任何专辑时，面板 SHALL 显示占位提示，引导用户操作。

#### Scenario: 占位提示展示
- **WHEN** 用户取消选中或尚未选中任何专辑
- **THEN** 面板 SHALL 居中显示占位图标和"点击左侧专辑查看详情"提示，头部显示"专辑详情"标题

### Requirement: 面板头部与取消选中方式

面板头部 SHALL 常驻显示；选中专辑时展示专辑名和艺术家信息；Esc 键 SHALL 可以取消选中。

#### Scenario: 头部展示
- **WHEN** 选中一张专辑
- **THEN** 头部 SHALL 显示该专辑的专辑名和艺术家

#### Scenario: Esc 取消选中
- **WHEN** 面板选中专辑且无弹窗打开时，用户按下 Esc
- **THEN** 取消选中，面板回到占位态

#### Scenario: 弹窗打开时 Esc 不取消选中
- **WHEN** 有弹窗（登录、在线搜索、手动修 ID、风格统计等）打开时，用户按下 Esc
- **THEN** 面板选中态 SHALL 不被取消（Esc 由弹窗处理或忽略）

### Requirement: 取消选中重置风格编辑态

任何取消选中的路径（Esc、再点选中行）SHALL 退出风格标签的就地编辑态。

#### Scenario: 编辑中取消选中
- **WHEN** 用户正在编辑风格标签时取消选中
- **THEN** 编辑态被取消，未保存的修改丢弃

### Requirement: 选中专辑被过滤后面板回到占位态

当选中专辑被搜索或筛选条件过滤出列表时，面板 SHALL 回到占位态；条件移除、专辑回到列表后详情 SHALL 自动重现。

#### Scenario: 筛选过滤掉选中专辑
- **WHEN** 面板展示详情时，用户应用搜索或筛选条件使选中专辑不在列表中
- **THEN** 面板回到占位态（布局不变）

#### Scenario: 移除筛选后重现
- **WHEN** 用户移除筛选条件，选中专辑重新出现在列表中
- **THEN** 面板自动重新展示该专辑详情

### Requirement: 详情内容展示完整专辑信息

面板详情 SHALL 采用 hero 两栏布局：封面图居左放大展示（正方形，随面板宽度在约 140–240px 间流体伸缩），风格标签、我的评分、元数据、外链与操作按钮位于右侧信息列；曲目列表位于两栏下方、面板全宽展示。

面板详情 SHALL 包含以下内容：

- 封面图（来自 cover_url，无封面时显示占位符）
- 所有风格标签（完整展示，不截断），旁边带有 ✏️ 编辑按钮可进入就地编辑态
- 实体收藏标记控件（黑胶/CD/磁带分段按钮组，可多选，见 physical-media spec）
- RateYourMusic 外部链接（恒显示，且恒为搜索页，见下方 requirement）
- Discogs / AllMusic / Last.fm / Wikipedia 外部链接（各自取到时才显示）
- MusicBrainz 外部链接（基于 musicbrainz_id，字段为空时不显示）
- 网易云音乐外部链接（基于 netease_id）
- MB 评分（mb_rating，为空时显示"—"）
- 评分人数（mb_rating_count）
- 发行日期（release_date，为空时显示"—"）
- 曲目数（track_count）
- 同步时间（synced_at）
- 补全时间（enriched_at，未补全时显示"未补全"）

#### Scenario: hero 两栏布局

- **WHEN** 用户选中一张专辑
- **THEN** 详情顶部 SHALL 以两栏展示：左侧为放大的正方形封面，右侧为风格标签、评分、元数据与外链操作区；曲目列表 SHALL 位于两栏下方全宽

#### Scenario: 完整数据展示
- **WHEN** 用户选中一个已补全的专辑
- **THEN** 面板显示封面图、所有风格标签（旁边有编辑按钮）、MusicBrainz 链接、网易云链接、MB 评分、评分人数、发行日期、曲目数、同步时间和补全时间

#### Scenario: 部分数据缺失
- **WHEN** 用户选中一个未补全或部分数据为空的专辑
- **THEN** 缺失字段使用"—"或"未补全"等占位文字，MusicBrainz 链接在 musicbrainz_id 为空时不显示，封面图为空时显示占位符，风格区域显示"—"但仍然提供编辑按钮

### Requirement: 详情面板展示外部站点链接

面板 SHALL 提供到第三方音乐数据库的跳转链接，让用户自行查阅本系统未采集的数据（如 RYM 的风格分类）。系统**只提供链接，不抓取这些站点的内容**。

RYM 入口 SHALL 恒显示，且 SHALL 恒指向**搜索页**，SHALL NOT 使用 MusicBrainz 里存的 release 直链——实测那些直链点不开（MB 记录的 slug 与实际不符，或 RYM 拦截直达访问），而搜索页不依赖 slug 规则，是唯一可靠的入口。因此 RYM 入口与 external_links 的回填状态无关，任何专辑在任何时刻都可点。

#### Scenario: RYM 入口恒为搜索页

- **WHEN** 用户选中任一专辑
- **THEN** 面板 SHALL 展示 RateYourMusic 入口，指向 `https://rateyourmusic.com/search?searchterm=<艺术家 专辑名>&searchtype=l`
- **AND** SHALL NOT 使用 external_links 中的 rym 直链
- **AND** SHALL NOT 显示 loading 态或占位符（搜索链接任何时刻都可用）

#### Scenario: 其余站点按需显示

- **WHEN** 专辑的 external_links 含 discogs / allmusic / lastfm / wikipedia 字段
- **THEN** 面板 SHALL 展示对应链接；字段缺失时 SHALL NOT 显示该项

#### Scenario: 链接数量与换行

- **WHEN** 面板展示多个外部链接
- **THEN** 链接 SHALL 以可换行的横排展示，SHALL NOT 溢出面板宽度

### Requirement: 外部站点链接的惰性采集

系统 SHALL 在详情面板打开时按需采集该专辑的 external_links，SHALL NOT 提供批量回填入口。

本机库规模（数千张专辑）按 MusicBrainz 的 1 req/s 限速全量回填需数十分钟，且实测持续请求下 MusicBrainz 频繁返回 503；而用户实际只会查看其中一部分专辑，且 RYM 入口恒为搜索页、已保证全部专辑可点。故采用「用户看哪张补哪张」，与曲目数据的惰性补全同款思路。

#### Scenario: 面板打开时按需查询

- **WHEN** 用户选中一张 external_links 为 NULL 且有 musicbrainz_id 的专辑
- **THEN** 系统 SHALL 调用 MusicBrainz lookup（`inc=url-rels`）获取链接并落库，SHALL NOT 阻塞面板渲染（先按当前数据渲染，查询返回后补上其余站点链接；RYM 入口不受影响）

#### Scenario: 每张专辑只查一次

- **WHEN** 专辑的 external_links 已非 NULL（含 `'{}'`）
- **THEN** 系统 SHALL 直接返回已存链接或空对象，SHALL NOT 发起 MusicBrainz 请求

#### Scenario: 无 musicbrainz_id 时不查询

- **WHEN** 用户选中一张 external_links 为 NULL 且 musicbrainz_id 也为空的专辑
- **THEN** 系统 SHALL 不发起查询，SHALL NOT 写入任何值（该专辑后续补全拿到 musicbrainz_id 后仍应再试）

#### Scenario: 查询失败不落库

- **WHEN** 惰性查询因网络错误或 MusicBrainz 不可用而失败
- **THEN** 系统 SHALL 保持 external_links 为 NULL 以便下次打开面板重试
- **AND** SHALL NOT 写入空对象——否则一次网络抖动会把该专辑永久钉死成「无链接」

#### Scenario: 并发去重

- **WHEN** 同一专辑的多个查询在未完成时并发到达
- **THEN** 系统 SHALL 仅发起一次查询，其余直接返回

### Requirement: 外部链接在系统浏览器中打开

点击面板中的任一外部链接（RYM / Discogs / AllMusic / Last.fm / Wikipedia / MusicBrainz / 网易云音乐）SHALL 通过系统默认浏览器打开，而非在 Electron 应用内打开。

#### Scenario: 点击外部链接
- **WHEN** 用户点击面板中的任一外部链接
- **THEN** 系统默认浏览器打开对应的 URL

### Requirement: 详情面板展示曲目列表

面板详情 SHALL 展示该专辑的所有曲目，按碟片号和曲目号顺序排列，每首曲目显示基本信息。

#### Scenario: 选中后加载曲目

- **WHEN** 用户选中一个专辑
- **THEN** 系统 SHALL 通过 `track:listByAlbum` 接口获取该专辑的曲目列表，并在面板中渲染

#### Scenario: 曲目信息展示

- **WHEN** 曲目列表加载完成且有曲目数据
- **THEN** 每首曲目 SHALL 展示以下信息：曲目序号（`track_number`）、标题（`title`）、艺术家（`artist`，为空时显示"—"）、时长（`duration_ms` 格式化为 `m:ss`，为空时显示"—"）

#### Scenario: 多碟专辑分组展示

- **WHEN** 专辑的曲目包含多个不同的 `disc_number`
- **THEN** 系统 SHALL 按碟片号分组展示，每组前显示 "Disc 1"、"Disc 2" 等分组标题

#### Scenario: 单碟专辑不显示碟片标题

- **WHEN** 专辑的所有曲目 `disc_number` 均为 1
- **THEN** 系统 SHALL 不显示碟片分组标题，直接展示曲目列表

#### Scenario: 无曲目数据

- **WHEN** 曲目列表为空（该专辑没有任何曲目记录）
- **THEN** 面板 SHALL 显示"暂无曲目信息"占位提示

#### Scenario: 曲目缓存

- **WHEN** 用户取消选中后再次选中同一专辑
- **THEN** 系统 SHALL 使用已缓存的曲目数据，不再重复请求

### Requirement: 选中详情时自动补全曲目数据

#### Scenario: 本地无曲目数据时自动从远程拉取

- **WHEN** `track:listByAlbum` 被调用，该专辑的 track 表记录为空，且专辑有有效的 `netease_album_id`
- **THEN** 系统 SHALL 自动调用曲目同步服务从 ncm-cli 拉取该专辑的曲目，写入 track 表后返回结果

#### Scenario: 本地已有曲目数据

- **WHEN** `track:listByAlbum` 被调用，该专辑的 track 表已有记录
- **THEN** 系统 SHALL 直接返回本地数据，不触发远程拉取

#### Scenario: 远程拉取失败

- **WHEN** 自动拉取曲目时 ncm-cli 调用失败
- **THEN** 系统 SHALL 返回空曲目列表，前端显示"暂无曲目信息"

### Requirement: 详情面板展示网易云热评

面板详情 SHALL 在曲目列表下方展示该专辑的网易云音乐热门评论；专辑无 `netease_album_id` 时 SHALL 不显示评论区块。

#### Scenario: 选中后加载热评

- **WHEN** 用户选中一张有 `netease_album_id` 的专辑
- **THEN** 系统 SHALL 通过 `album:comments` 接口获取该专辑的热评（首屏 20 条）并在曲目列表下方渲染

#### Scenario: 评论信息展示

- **WHEN** 评论加载完成且有条评论数据
- **THEN** 每条评论 SHALL 展示：头像（加载失败时隐藏）、昵称、内容（保留换行）、点赞数、日期（YYYY-MM-DD）
- **THEN** 区块头部 SHALL 显示热评总数与刷新按钮

#### Scenario: 无网易云 ID 时隐藏区块

- **WHEN** 选中专辑的 `netease_album_id` 为空
- **THEN** 详情面板 SHALL 不显示评论区块

#### Scenario: 无评论数据

- **WHEN** 评论接口返回空列表
- **THEN** 区块 SHALL 显示"暂无评论"占位提示

#### Scenario: 加载失败

- **WHEN** 评论接口调用失败（超时、网络错误或未登录）
- **THEN** 区块 SHALL 显示失败提示（未登录时提示需要登录）与重试按钮，且 SHALL 不影响面板其他内容

### Requirement: 热评内存缓存与刷新

热评 SHALL 仅缓存在渲染进程内存中（不持久化），缓存有效期 5 分钟，且提供手动刷新。

#### Scenario: TTL 内命中缓存

- **WHEN** 用户选中专辑时，该专辑评论在 5 分钟内加载过
- **THEN** 系统 SHALL 直接使用内存缓存，不重复请求接口

#### Scenario: 超过 TTL 重新加载

- **WHEN** 用户选中专辑时，缓存超过 5 分钟
- **THEN** 系统 SHALL 重新请求评论接口并更新缓存

#### Scenario: 手动刷新

- **WHEN** 用户点击评论区块的刷新按钮
- **THEN** 系统 SHALL 忽略 TTL 立即重新请求并更新缓存与展示

#### Scenario: 应用退出后缓存失效

- **WHEN** 应用退出后重新启动
- **THEN** 评论缓存 SHALL 不存在，首次选中专辑时 SHALL 重新拉取
