# 任务

- [x] 探测 ncm-cli 0.1.6 艺术家命令族（结论：`artist songs --artistId <加密ID>`、`search all` 含 artists；ID 需存明文+加密，见 design.md）
- [x] OpenSpec 变更文档（本目录 proposal/design/tasks）
- [x] database.ts：followed_artist 建表 + album.artist_ids 迁移列 + ExportData v2（followedArtists）+ import 兼容 v1
- [x] 新建 followed-artist-service.ts（follow/unfollow/isFollowed/getFollowedNames/list 含 album_count）
- [x] album-service.ts：Album/AlbumInsert/AlbumUpdate 加 artist_ids；insertAlbum 持久化；queryAlbums 支持 followedOnly/artistPartial；getAlbumsWithoutArtistIds()
- [x] sync 链路透传：sync-service.ts（NeteaseAlbum.artist_ids）、ncm-cli-sync-service.ts（toNeteaseAlbum）、sync-manager.ts（sync + syncSingleAlbum）
- [x] AlbumSearchModal.vue：handleAdd 载荷携带 artist_ids
- [x] ipc-handlers.ts：artist:follow / artist:unfollow / artist:listFollowed；album:artistIdFillStatus / album:artistIdFillStart（防重入 + 登录检查 + 300ms 限流 + 进度事件）；album:addToCollection 载荷扩展
- [x] preload index.ts + index.d.ts：新方法与类型（Album、AlbumQueryOptions、addToCollection 载荷）
- [x] ncm-cli-service.ts：艺术家命令封装预留注释区（记录探测结论）
- [x] App.vue：followedArtists/followedOnly/popover 状态、splitArtists/albumArtistsWithIds 助手、详情面板芯片化 + 星标、表格/唱片墙纯文本（已关注金色文字）+ 卡片角标、回填进度条、v-memo 依赖更新、工具栏「★ 已关注」开关、toggleFollowArtist 乐观更新、buildAlbumQueryOptions 接线
- [x] 新建 ArtistActionPopover.vue（fixed 定位 + backdrop/Esc/滚动关闭 + 关注/筛选两动作）
- [x] 关注列表独立窗口：electron.vite.config 多页面入口（followed.html）+ followed-main.ts + FollowedArtistsWindow.vue（单实例、无菜单栏、行点击筛选主窗口并关闭、跨窗口广播同步）+ index.ts createFollowedWindow + 菜单「工具 → 关注列表」入口
- [x] 新建 window-ref.ts：主窗口显式引用（getAllWindows()[0] 顺序无保证，事件转发/对话框挂载全部改走 getMainWindow()）
- [x] 回填完成后补齐关注记录 ID：followed-artist-service.ts fillMissingIdsFromAlbums() + 回填结果 idsMerged 提示
- [x] 边界处理：followedOnly 空结果提示、关注列表加载失败降级、取关后刷新列表
- [x] 更新 openspec/specs/：新建 artist-follow/spec.md；增补 data-sync / album-list-ui / local-storage / ncm-cli-adapter
- [x] 归档 change 到 openspec/changes/archive/ 并同步 README.md

## 用户侧验证清单

- [x] 详情面板艺术家芯片可点击弹出菜单；表格/唱片墙为纯文本（已关注艺术家名金色文字），不可点击
- [x] 关注/取消关注：星标与金色文字即时变化（含表格行与卡片）、重启后保留
- [x] 多艺术家专辑 "A/B"：点 A 只关注 A；「已关注」筛选命中含 A 的专辑
- [x] 工具栏「★ 已关注 (n)」开关过滤列表；菜单「工具 → 关注列表」独立窗口显示专辑数与关注日期、可取关、无菜单栏
- [x] 关注列表窗口点击艺术家行：主界面应用该艺术家筛选并关闭窗口（window-ref 修复转发丢失）
- [x] 在线搜索添加专辑后其艺术家可关注（`' / '` 分隔拆分正确）
- [x] 同步新增专辑 artist_ids 有值；老库「回填艺术家 ID」显示实时进度条，完成后 NULL 列被填且缺失 ID 的关注记录被补齐
- [x] 导出→导入往返：v1 老文件可导入，新 v2 文件含 followed_artist
