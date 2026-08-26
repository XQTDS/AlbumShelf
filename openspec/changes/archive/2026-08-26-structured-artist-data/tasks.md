# 任务

- [x] OpenSpec 变更文档（本目录 proposal/design/tasks）
- [x] database.ts：CREATE_ALBUM_TABLE 加 artists 列 + 迁移 ADD COLUMN artists（暂不删 artist_ids）
- [x] sync-service.ts：NeteaseAlbum.artist_ids → artists（含 name）；ncm-cli-sync-service.ts：join(' / ') + 写 artists；sync-manager.ts：AlbumInsert/syncSingleAlbum 参数切换
- [x] 新建 album-artist.ts（splitArtistText 迁入 + parseAlbumArtistsJson + albumArtistRefs）；followed-artist-service.ts re-export splitArtistText
- [x] album-service.ts：Album/AlbumInsert/AlbumUpdate/insertAlbum 字段改名；queryAlbums 预计算块与 getAllArtists 改 albumArtistRefs；getAlbumsWithoutArtistIds → getAlbumsWithoutArtists
- [x] followed-artist-service.ts：list() album_count 与 fillMissingIdsFromAlbums() 改结构化按 name 匹配
- [x] ipc-handlers.ts：addToCollection 载荷 artists；回填任务写 artists（含 name）+ 重写 artist 文本 + guard 切换
- [x] preload/index.d.ts：Album.artists / AddAlbumRequest.artists 类型
- [x] App.vue：Album 接口、v-memo 依赖、parseAlbumArtists/albumArtists helper、isAlbumFollowed、调用点改名
- [x] AlbumSearchModal.vue：handleAdd 载荷 artists
- [x] 清理：database.ts DROP COLUMN artist_ids（best-effort）+ import 列清单切换 + grep artist_ids 零命中（仅保留迁移中的 DROP 引用）
- [x] 更新 openspec/specs/：local-storage / data-sync / artist-follow / album-list-ui / ncm-cli-adapter
- [x] 归档 change 到 openspec/changes/archive/（README 预计无需同步：数据层重构，功能描述不变）

## 用户侧验证清单

- [ ] v1.0.5 旧库与开发机当前库启动均正常；新库基表含 artists、无 artist_ids
- [ ] 在线添加艺术家名含 `/` 的专辑（如 AC/DC）：详情面板显示单个「AC/DC」芯片；筛选可整名命中
- [ ] 同步新专辑：artist 为 ' / ' 连接、artists JSON 含 name+ID
- [ ] 艺术家下拉建议/精确筛选/部分匹配/「已关注」在有、无结构化数据的行上均正确
- [ ] 关注链路：芯片关注带 ID 艺术家 → 关注列表有 ID；回填后关注记录 ID 补齐
- [ ] 回填任务：进度正常、完成后 artists 非空且 artist 文本规范化、二跑 pending=0、未登录中止不崩
- [ ] 导出→导入 round-trip：artists 保留；旧开发版 v2 文件导入不报错
- [ ] 搜索/MB 补全/随机提示/评分编辑无回归
