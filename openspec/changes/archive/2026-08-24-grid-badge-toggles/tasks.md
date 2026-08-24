# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-08-24-grid-badge-toggles/` 变更文档（proposal/design/tasks）

## 渲染层（`src/renderer/src/App.vue`）

- [x] 状态：`gridBadges` reactive 开关对象 + localStorage 读写（key `albumShelfGridBadges`，默认 `{ media: true, userRating: false, mbRating: false, releaseDate: false }`，损坏数据回退默认）
- [x] 显示规则：`showUserRatingBadge / showMbRatingBadge / showReleaseDateBadge` computed（开关 OR 按该字段排序）+ `hasCardBadges(album)` 容器判定；删除 `cardBadgeText`
- [x] 工具栏：网格排序工具栏新增 4 枚开关按钮（实体/我的评分/MB评分/发行日期），排序锁定态 `disabled` + 提示；工具栏 `flex-wrap: wrap`
- [x] 卡片模板：介质角标 `v-if` 加 `gridBadges.media`；左下角改为 `.card-badges` 容器纵向堆叠三枚 `.card-badge`
- [x] 卡片 `v-memo` 依赖数组追加四个开关值
- [x] CSS：绝对定位/播放按钮预留空间上移至 `.card-badges`；`.card-badge` 退化为容器内徽章；新增开关按钮样式

## 收尾

- [x] 更新 `openspec/specs/album-list-ui/spec.md`：「排序时卡片角标」改写为「排序固定显示对应角标」；「唱片墙介质角标」常驻显示表述改为开关控制；新增「唱片墙角标显示开关」requirement
- [x] 更新 `openspec/specs/physical-media/spec.md`：「唱片墙卡片角标」场景去掉「常驻显示」，改为「受显示开关控制，默认显示」
- [x] README 同步（功能说明、使用方式）
- [x] 用户手动 `npm run dev` QA：
  - 开关组合遍历（仅开日期/仅开 MB评分/全开）左下角堆叠视觉，与播放按钮不重叠
  - 按某字段排序 → 对应开关锁定且角标显示；取消排序恢复原值
  - 重启后开关状态保持；localStorage 损坏回退默认
  - 窄窗口工具栏换行；表格视图行为不变
- [x] QA 通过后归档 change 到 `openspec/changes/archive/`
