## Context

AlbumShelf 使用 SQLite 存储专辑数据，风格信息通过 `genre` 表和 `album_genre` 多对多关联表维护。现有 `AlbumService` 提供了 `getAllGenres()` 获取风格列表和 `setAlbumGenres()` 管理风格关联，但缺少统计查询。前端已有多个弹窗组件（`SettingsModal`、`FuzzyMatchModal`、`LoginModal` 等）可参考实现模式。项目无图表库依赖。

## Goals / Non-Goals

**Goals:**
- 提供全库风格统计数据（各风格关联的专辑数量）
- 以独立弹窗展示 Top 15 风格的水平条形图 + "其他" 汇总行
- 展示辅助统计：收藏总数、有风格标签的专辑数

**Non-Goals:**
- 不跟随当前筛选条件，始终统计全部收藏
- 不引入第三方图表库
- 不支持点击条形图跳转或筛选

## Decisions

### 1. 统计查询使用单条 SQL + 应用层分组

```sql
SELECT g.name, COUNT(ag.album_id) as album_count
FROM genre g
JOIN album_genre ag ON g.id = ag.genre_id
GROUP BY g.id, g.name
ORDER BY album_count DESC
```

**理由**：数据量小（genre 表通常百量级），单条 SQL 高效，无需分页或缓存。Top 15 截断和"其他"汇总在应用层完成，保持 SQL 简单。

**替代方案**：在 SQL 中用 `LIMIT 15` + 子查询计算"其他"，但增加查询复杂度，收益不大。

### 2. 条形图使用纯 CSS 实现

水平条形图用 `<div>` + `width` 百分比（相对于最大值），不引入 Chart.js/ECharts。

**理由**：只需一种图表类型，纯 CSS 零依赖、零打包体积，与项目现有 UI 风格一致。

### 3. Top 15 + "其他"策略

前端接收完整统计数据后，取前 15 条展示独立条形，其余汇总为一条"其他"。若总风格数 ≤ 15，则不显示"其他"行。

**理由**：15 条在弹窗中可一屏展示，不需要滚动；"其他"避免长尾信息丢失。

### 4. IPC 返回完整数据，分组逻辑在前端

`genre:stats` handler 返回 `{ stats: [{name, count}], totalAlbums, albumsWithGenre }`，不做 Top N 截断。

**理由**：后端保持通用，未来若需调整显示数量（如 Top 10 或 Top 20），只需改前端。

## Risks / Trade-offs

- **[风格数量极少]** → 收藏量少或未补全时统计意义不大，弹窗显示空状态提示"暂无风格数据"
- **[一专辑多风格导致数量之和 > 专辑总数]** → 在弹窗中明确标注"因一张专辑可能有多个风格标签，数量之和可能大于收藏总数"