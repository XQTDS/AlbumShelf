## 1. 工程初始化

- [x] 1.1 使用 electron-vite 创建 Electron + Vue 3 项目脚手架
- [x] 1.2 安装核心依赖：better-sqlite3、musicbrainz-api、@electron/rebuild
- [x] 1.3 配置 electron-rebuild，确保 better-sqlite3 可在 Electron 中正常运行
- [x] 1.4 配置项目基本结构（main/preload/renderer 三层目录）

## 2. 数据库层 (local-storage)

- [x] 2.1 实现数据库初始化模块：首次启动时在 `app.getPath('userData')` 下创建 `album-shelf.db`
- [x] 2.2 编写建表语句：Album 表（含 id、netease_id、musicbrainz_id、title、artist、cover_url、release_date、mb_rating、mb_rating_count、track_count、synced_at、enriched_at、created_at）
- [x] 2.3 编写建表语句：Track 表（含 id、album_id、netease_id、title、artist、track_number、disc_number、duration_ms、created_at）
- [x] 2.4 编写建表语句：Genre 表（id、name）和 album_genre 关联表（album_id、genre_id，联合唯一约束）
- [x] 2.5 实现 AlbumService：提供专辑的 CRUD 操作和查询方法（支持筛选、排序、搜索、分页）

## 3. 数据同步层 (data-sync)

- [x] 3.1 定义 SyncService 抽象接口（fetchCollectedAlbums、checkLoginStatus）
- [x] 3.2 实现 MockSyncService：返回 10-20 条真实专辑种子数据，覆盖不同年代、风格和艺术家
- [x] 3.3 实现同步逻辑：调用 SyncService 获取专辑列表，通过 netease_id 增量去重写入数据库
- [x] 3.4 预留 NcmCliSyncService 占位（接口定义 + TODO 注释，待 ncm-cli 支持后实现）

## 4. 数据补全层 (data-enrichment)

- [x] 4.1 封装 MusicBrainz API 客户端：使用 musicbrainz-api 库，配置 User-Agent 和认证凭据
- [x] 4.2 实现请求频率控制：确保 API 调用间隔不小于 200ms（5 req/s）
- [x] 4.3 实现专辑匹配逻辑：按专辑名 + 艺术家名搜索 Release Group，取 score 最高结果
- [x] 4.4 实现数据补全逻辑：获取匹配 Release Group 的 ratings 和 tags，写入 Album 表和 Genre 关联
- [x] 4.5 实现批量补全流程：同步完成后自动对未补全的新专辑逐个发起匹配，支持进度回调
- [x] 4.6 实现 MusicBrainz 凭据配置：使用 Electron safeStorage API 加密存储用户名/密码

## 5. IPC 通信层

- [x] 5.1 实现 preload 脚本：通过 contextBridge 暴露 electronAPI 接口
- [x] 5.2 注册 ipcMain handlers：同步操作（sync:start）、查询专辑列表（album:list）、获取筛选选项（album:filters）
- [x] 5.3 注册 ipcMain handlers：补全状态（enrich:status）、MusicBrainz 凭据管理（mb:setCredentials、mb:checkCredentials）

## 6. 前端 UI (album-list-ui)

- [x] 6.1 实现主布局组件：顶部工具栏（搜索框 + 筛选器 + 同步按钮）+ 表格区域 + 底部分页
- [x] 6.2 实现专辑表格组件：渲染序号、专辑名、艺术家、评分、风格、发行日期列
- [x] 6.3 实现搜索框：输入关键词实时过滤（按专辑名/艺术家，不区分大小写）
- [x] 6.4 实现艺术家下拉筛选器：从数据库获取所有艺术家列表，选择后过滤表格
- [x] 6.5 实现风格下拉筛选器：从数据库获取所有风格标签列表，选择后过滤表格
- [x] 6.6 实现评分列头排序：点击切换升序/降序，无评分专辑排最后
- [x] 6.7 实现发行日期列头排序：点击切换升序/降序，无日期专辑排最后
- [x] 6.8 实现分页控件：上一页/下一页按钮，显示当前页码和总页数
- [x] 6.9 实现空状态提示：无数据时引导用户点击"同步"按钮
- [x] 6.10 实现同步按钮交互：点击触发同步，加载中显示 loading 状态并禁用按钮，完成后刷新表格
- [x] 6.11 实现补全进度展示：批量补全时显示进度（如"正在补全 3/15"）
- [x] 6.12 实现错误提示：同步失败或凭据未配置时显示相应提示信息

## 7. 整合与测试

- [x] 7.1 端到端流程验证：同步 → 入库 → 自动补全 → 表格展示 → 筛选/排序/搜索
- [x] 7.2 验证 Mock 数据在各功能模块中的正确性
- [x] 7.3 验证筛选、排序、搜索的组合使用场景
