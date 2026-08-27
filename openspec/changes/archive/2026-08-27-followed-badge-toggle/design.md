# 技术设计：唱片墙已关注角标显隐开关

## 1. 现状

- `App.vue` 中已有关注角标的渲染点是唱片墙卡片右上角：

  ```html
  <div v-if="isAlbumFollowed(album)" class="card-follow-badge" title="含已关注艺术家">★</div>
  ```

  显示条件只有 `isAlbumFollowed(album)`（专辑的任意艺术家在 `followedArtists` 集合中），无任何开关。

- 「角标」开关组（2026-08-24 grid-badge-toggles 建立）已具备完整的可扩展骨架：

  ```ts
  interface GridBadgeToggles {
    media: boolean
    userRating: boolean
    mbRating: boolean
    releaseDate: boolean
  }
  const GRID_BADGE_DEFAULTS: GridBadgeToggles = { media: true, userRating: false, mbRating: false, releaseDate: false }
  const gridBadges = reactive<GridBadgeToggles>(loadGridBadges())  // 读写 localStorage albumShelfGridBadges
  const BADGE_TOGGLE_ITEMS = [
    { key: 'media', label: '实体', icon: '💿', sortField: undefined },
    { key: 'userRating', label: '我的评分', icon: '★', sortField: 'user_rating' },
    { key: 'mbRating', label: 'MB评分', icon: '⭐', sortField: 'mb_rating' },
    { key: 'releaseDate', label: '发行日期', icon: '📅', sortField: 'release_date' }
  ] as const
  ```

  工具栏按钮由 `v-for="t in BADGE_TOGGLE_ITEMS"` 渲染，`sortField` 为 `undefined` 的项（实体）不参与排序锁定。

## 2. 方案

### 2.1 状态扩展

- `GridBadgeToggles` 增加 `followed: boolean`
- `GRID_BADGE_DEFAULTS.followed = true`（默认开，与现状「常驻显示」一致）
- `loadGridBadges()` 逐字段校验中追加：

  ```ts
  followed: typeof parsed.followed === 'boolean' ? parsed.followed : GRID_BADGE_DEFAULTS.followed
  ```

  旧版本写入的 localStorage 数据不含 `followed` 字段 → 回退默认 `true` → 升级用户视觉不变。

持久化沿用现有 `watch(gridBadges, ...)` 写回 `albumShelfGridBadges`，无独立存储键。

### 2.2 开关项

`BADGE_TOGGLE_ITEMS` 末尾追加：

```ts
{ key: 'followed', label: '已关注', icon: '★', sortField: undefined }
```

- `sortField: undefined` 复用「实体」开关的同款语义：无对应排序字段，永不进入锁定态（模板中 `locked`/`disabled` 判定依赖 `t.sortField != null`，无需改动）
- `icon` 用 `★`，与卡片角标、顶部「★ 已关注 (n)」筛选按钮的视觉语言一致（标签文字「已关注」与「我的评分」区分语义）
- 工具栏按钮 hover 提示由既有 `badgeToggleTitle(t)` 自动生成（`sortField == null` 走 `${t.label}角标：点击隐藏/点击显示` 分支）

### 2.3 渲染

- 角标元素：

  ```html
  <div v-if="gridBadges.followed && isAlbumFollowed(album)" class="card-follow-badge" title="含已关注艺术家">★</div>
  ```

  注释同步更新（去掉「常驻」表述）。`.card-follow-badge` 样式不变。

- 卡片 `v-memo` 依赖数组追加 `gridBadges.followed`，否则关闭开关后已缓存的卡片不会重渲染：

  ```
  [..., gridBadges.media, gridBadges.userRating, gridBadges.mbRating, gridBadges.releaseDate, gridBadges.followed, ...]
  ```

### 2.4 边界情况

| 场景 | 行为 |
| --- | --- |
| 旧版本 localStorage 无 `followed` 字段 | 回退默认 `true`，角标显示（与升级前一致） |
| 存储值类型非法（非 boolean） | 回退默认 `true` |
| 「只看已关注」筛选开启 | 不影响开关状态，不锁定（筛选是过滤，与角标显示解耦） |
| 关注/取关广播导致 `followedArtists` 变更 | 仅影响 `isAlbumFollowed` 判定，与开关无关 |
| 删除本地存储、隐私窗口 | 走既有降级路径，默认值生效 |

## 3. 不改动的部分

- 表格视图、详情面板芯片、金色文字标识
- 关注数据结构/IPC（artist-follow 能力相关代码全不动）
- 工具栏布局 CSS（`.grid-badge-toggles` 已有 `flex-wrap: wrap`，新增一枚按钮窄窗口自动换行）
