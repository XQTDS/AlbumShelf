## 1. 数据库层

- [x] 1.1 在 `database.ts` 中添加 migration：检测 album 表是否有 `user_rating` 列，若无则 ALTER TABLE ADD COLUMN `user_rating REAL`
- [x] 1.2 在 `album-service.ts` 的 `Album` 接口中添加 `user_rating: number | null` 字段
- [x] 1.3 在 `album-service.ts` 的 `AlbumQueryOptions.sortBy` 类型中添加 `'user_rating'` 选项
- [x] 1.4 在 `album-service.ts` 的 `queryAlbums` 方法中添加 `user_rating` 排序逻辑（NULL 值排最后）

## 2. IPC 与 Preload 层

- [x] 2.1 在 `ipc-handlers.ts` 中新增 `album:setRating` handler，包含评分值校验（范围 0.5~5.0，步长 0.5，或 null）
- [x] 2.2 在 `preload/index.ts` 中新增 `albumSetRating(albumId: number, rating: number | null)` API 方法
- [x] 2.3 在 `preload/index.d.ts` 中更新类型声明

## 3. 前端 — 列表行展示

- [x] 3.1 在 `App.vue` 的 `Album` 接口中添加 `user_rating: number | null` 字段
- [x] 3.2 在列表表头中将原"评分"列拆分为"我的评分"和"MB评分"两列，两者均可排序
- [x] 3.3 在列表行中添加"我的评分"列：已评分显示只读星星图标 + 数字，未评分显示 "—"
- [x] 3.4 更新 `sortBy` 类型和 `toggleSort` 函数以支持 `'user_rating'` 排序

## 4. 前端 — 详情展开区评分组件

- [x] 4.1 在详情展开区 `detail-info` 中添加"我的评分"行，包含可交互的星级评分组件
- [x] 4.2 实现半星评分交互：5 颗星各分左右两半（共 10 个点击区域），支持鼠标悬浮预览
- [x] 4.3 实现点击即保存逻辑（乐观更新 + 异步 IPC 调用 + 失败回退）
- [x] 4.4 实现清除评分按钮（仅在已有评分时显示）

## 5. 样式

- [x] 5.1 添加列表行"我的评分"列的只读星星样式
- [x] 5.2 添加详情区交互式评分组件样式（星星 SVG、悬浮高亮、点击反馈、清除按钮）
- [x] 5.3 调整列宽以容纳新增的"我的评分"列