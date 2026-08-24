# 技术方案设计

## 1. 现状

`App.vue` 唱片墙卡片角标：

- **介质角标**（左上角）：`v-if="parseMedia(album).length > 0"` 渲染 `.card-media-badges`，常驻显示，与排序无关
- **排序角标**（左下角）：`v-if="cardBadgeText(album)"` 渲染单枚 `.card-badge`，`cardBadgeText()` 按 `sortBy` 返回对应字段值（★ user_rating / ⭐ mb_rating / 日期），字段为空返回空串
- 排序状态 `sortBy/sortOrder` 由表格列头与网格下拉框共享；卡片 `v-memo` 依赖数组中已含 `sortBy, sortOrder`
- UI 偏好持久化惯例：`localStorage`（`albumShelfViewMode` 即如此），渲染层内完成，无需 IPC

## 2. 开关模型

```ts
interface GridBadgeToggles {
  media: boolean       // 实体图标（左上角）
  userRating: boolean  // 我的评分 ★
  mbRating: boolean    // MB评分 ⭐
  releaseDate: boolean // 发行日期
}
// 默认值：{ media: true, userRating: false, mbRating: false, releaseDate: false }
// localStorage key: albumShelfGridBadges（JSON 序列化；字段缺失/类型非法时回退默认值）
```

`gridBadges` 用 `reactive` 对象，`watch` 后写入 localStorage。`media` 无对应排序字段（不存在按介质排序），仅受开关控制。

## 3. 显示规则

角标显示 = `开关开启 OR 按该字段排序`，且字段值非空（保留现状空值不显示规则）：

| 角标 | 生效条件 | 位置 |
| --- | --- | --- |
| 实体图标 | `gridBadges.media` 且 `physical_media` 非空 | 左上角（现状） |
| 我的评分 | `gridBadges.userRating \|\| sortBy === 'user_rating'` 且 `user_rating != null` | 左下角堆叠 |
| MB评分 | `gridBadges.mbRating \|\| sortBy === 'mb_rating'` 且 `mb_rating != null` | 左下角堆叠 |
| 发行日期 | `gridBadges.releaseDate \|\| sortBy === 'release_date'` 且 `release_date` 非空 | 左下角堆叠 |

堆叠顺序固定：我的评分 → MB评分 → 发行日期。

## 4. 工具栏开关 UI

网格排序工具栏（排序下拉框旁）新增 4 枚 pill 式开关按钮，即时生效：

- **激活态**：开关开启，主色填充
- **锁定态**：当前正按该字段排序 → 按钮呈现选中 + 锁定（`disabled`），title 提示"当前按「XX」排序，角标固定显示"；取消排序后自动恢复开关原值
- 实体图标无排序字段，不存在锁定态

工具栏 CSS 增加 `flex-wrap: wrap`，窄窗口下开关组换行不溢出。

## 5. 模板与样式改造

- 卡片模板：介质角标 `v-if` 增加 `gridBadges.media` 条件；左下角单枚 `.card-badge` 改为 `.card-badges` 容器（absolute 定位）内多枚 `.card-badge` 纵向堆叠（flex column, gap 4px）
- `cardBadgeText()` 删除，改为按字段拆分的 `showUserRatingBadge/showMbRatingBadge/showReleaseDateBadge` computed + 容器级 `hasCardBadges(album)`
- CSS：绝对定位与"预留播放按钮空间"（`max-width: calc(100% - 44px)`）从 `.card-badge` 上移到 `.card-badges` 容器；`.card-badge` 退化为普通内联徽章（保留 nowrap/ellipsis，`max-width: 100%`）
- 卡片 `v-memo` 依赖数组追加四个开关值，开关切换时所有卡片重渲染

## 6. 边界与不变量

- 表格视图零改动
- 排序逻辑（列头点击/右键取消/下拉框/随机选择清条件）零改动，仅显示层消费 `sortBy`
- 角标与悬停播放按钮（右下）、遮罩、选中态共存规则不变
- 空值不显示角标（含排序强制显示时）

## 7. QA 关注点

- 开关组合遍历：仅开日期 / 仅开 MB评分 / 全开 → 左下角堆叠视觉与播放按钮不重叠
- 排序锁定：按某字段排序时对应开关置灰锁定、角标显示；取消排序后恢复原开关值
- 重启应用后开关状态保持；localStorage 数据损坏时回退默认值
- 窄窗口下工具栏开关组换行不溢出
- 表格视图行为不变
