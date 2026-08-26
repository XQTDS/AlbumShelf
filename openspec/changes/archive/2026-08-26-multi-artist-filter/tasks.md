# 任务

- [x] OpenSpec 变更文档（本目录 proposal/design/tasks）
- [x] album-service.ts：`queryAlbums` 的 `artist` 筛选从 SQL 等值匹配改为拆分后单名匹配（并入 JS 预计算路径，与 followedOnly/artistPartial 交集组合）
- [x] album-service.ts：`getAllArtists()` 拆分去重，仅返回单个艺术家名
- [x] 更新 openspec/specs/album-list-ui/spec.md：增补多艺术家专辑的筛选选项与筛选命中场景
- [x] 归档 change 到 openspec/changes/archive/（README 无需同步：bug 修复，功能描述不变）

## 用户侧验证清单

- [x] 艺术家筛选框输入 "A"：建议列表只出现单个艺术家名（无 "A / B"）
- [x] 选择艺术家 A：结果包含仅 A 的专辑与 "A / B" 合作专辑
- [x] 清除筛选：恢复显示所有专辑
- [x] 「★ 已关注」与艺术家筛选组合：结果为交集
- [x] 关注列表窗口 / 艺术家菜单「筛选该艺术家」仍按单名命中合作专辑
