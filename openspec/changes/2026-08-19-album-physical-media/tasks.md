# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-08-19-album-physical-media/` 变更文档（proposal/design/tasks）

## 主进程

- [x] `src/main/database.ts`：
  - 迁移段新增 `physical_media TEXT` 列（缺失时 ALTER TABLE 添加）
  - 导入事务（importAlbums）的 UPDATE / INSERT 显式列清单补上 `physical_media`
- [x] `src/main/ipc-handlers.ts`：
  - 新增 `album:setPhysicalMedia` handler：校验枚举值、去重排序、逗号拼接入库、空集合/清除写 NULL、专辑不存在返回错误
- [x] `src/main/album-service.ts`：
  - 确认 `Album` 类型含 `physical_media`（`getAlbumById` 走 `SELECT *`，类型补字段即可）；`updateAlbum` 无需改动

## preload

- [x] `src/preload/index.ts`：新增 `albumSetPhysicalMedia(albumId, mediaTypes)` 调用 `album:setPhysicalMedia`
- [x] `src/preload/index.d.ts`：补充类型声明

## 渲染层（`src/renderer/src/App.vue`）

- [x] 常量 `MEDIA_TYPES`（vinyl/cd/cassette → 黑胶/CD/磁带，图标由 MediaIcon 组件渲染）与辅助函数 `parseMedia` / `hasMedia` / `toggleMedia`
- [x] 渲染层 `Album` 接口追加 `physical_media: string | null`
- [x] 详情面板：「我的评分」之后新增「实体收藏」section，分段按钮组三枚，点击切换 + 乐观更新（`toggleMedia` → `window.api.albumSetPhysicalMedia`，失败回退 + showMessage）
- [x] 表格视图：表头新增「实体」列（「我的评分」之后），单元格渲染介质徽章或 `—`；哨兵行 colspan 7 → 8
- [x] 唱片墙：`.album-card` 左上角介质徽章（多枚并排、常驻显示、无标记不渲染）
- [x] 样式：`.media-segment` 分段按钮（选中填充/未选中描边）、表格 `.media-chip` 徽章、卡片 `.card-media-badge` 角标
- [x] 新增 `MediaIcon.vue` 组件（内联 SVG：黑胶 MDI album / CD·磁带 Twemoji，来源见 icon-candidates/README.md）

## 收尾

- [x] 更新 `openspec/specs/local-storage/spec.md`：Album 表字段清单与迁移场景补充 `physical_media`
- [x] 更新 `openspec/specs/album-detail-expand/spec.md`：详情内容清单新增「实体收藏」区块及交互场景
- [x] 更新 `openspec/specs/album-list-ui/spec.md`：表格列清单新增「实体」列；网格卡片新增左上角介质角标场景
- [x] 同步 `README.md`（详情面板与列表视图功能说明）
- [ ] 用户手动 `npm run dev` QA：
  - 详情面板：点分段按钮标记/取消黑胶+CD 等多值组合 → 立即生效、重进应用后保留
  - 表格视图：「实体」列徽章显示正确，无标记显示 —，列宽不挤压其他列
  - 唱片墙：左上角徽章与左下排序角标、右下播放按钮不重叠
  - 同步一次 → 已有标记不被覆盖；导出 → 导入 → 标记保留
  - 失败路径（如断开主进程）回退与错误提示
- [ ] QA 通过后归档 change 到 `openspec/changes/archive/`
