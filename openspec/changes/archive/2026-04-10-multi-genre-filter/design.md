## Context

当前 AlbumShelf 应用使用单选下拉框 (`<select>`) 进行风格筛选。后端 `album-service.ts` 通过单个 `genre` 参数进行查询，使用 `INNER JOIN` 关联 `album_genre` 和 `genre` 表。前端在 `App.vue` 中使用 `selectedGenre` 响应式变量存储单一风格值。

## Goals / Non-Goals

**Goals:**
- 支持同时选择多个风格进行筛选
- 使用 AND 逻辑：专辑必须包含所有选中的风格
- 提供直观的标签输入 UI 组件（支持自动完成）
- 专辑风格标签可点击切换筛选状态
- 显示已选中的风格，支持单个移除和全部清除

**Non-Goals:**
- 不支持 AND/OR 逻辑切换（仅实现 AND）
- 不支持风格的模糊匹配或层级关系
- 不更改风格数据的存储结构

## Decisions

### 1. 前端状态管理
**决策**: 使用 `selectedGenres: Ref<string[]>` 替代原有的 `selectedGenre: Ref<string>`

**原因**: 数组更适合表示多选状态，与现有 Vue 响应式系统兼容良好

### 2. 后端 API 参数设计
**决策**: 将 `genre` 参数改为 `genres`，接受逗号分隔的字符串（如 `"Rock,Jazz,Pop"`）

**原因**: 
- URL 友好，便于调试和日志记录
- 向后兼容：空字符串或不传等同于不筛选
- 备选方案：使用数组参数 `genres[]=Rock&genres[]=Jazz`，但解析更复杂

### 3. 多风格 AND 查询实现
**决策**: 使用子查询方式实现

```sql
-- 筛选同时包含 Rock 和 Jazz 的专辑
SELECT DISTINCT a.* FROM album a
WHERE a.id IN (
  SELECT album_id FROM album_genre ag
  JOIN genre g ON ag.genre_id = g.id
  WHERE g.name IN ('Rock', 'Jazz')
  GROUP BY album_id
  HAVING COUNT(DISTINCT g.name) = 2
)
```

**原因**:
- 使用 `HAVING COUNT(DISTINCT) = N` 确保专辑包含所有指定风格
- 比多次 `INNER JOIN` 更清晰，性能可接受
- 备选方案：多次 JOIN（`JOIN genre g1 ON... JOIN genre g2 ON...`），对于动态数量的风格实现复杂

### 4. 风格输入组件
**决策**: 自行实现简易标签输入组件，不引入第三方库

**原因**:
- 功能需求简单（输入、自动完成、标签显示）
- 减少依赖，保持项目轻量
- 与现有 UI 风格保持一致

### 5. 风格标签交互
**决策**: 在现有 `.genre-tag` 样式基础上添加交互状态

**原因**:
- 复用现有样式，只需添加 `clickable` 和 `selected` 状态类
- 保持视觉一致性

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 选择过多风格导致无结果 | 在 UI 上提示当前筛选条件，方便用户调整 |
| 自动完成列表过长 | 限制显示数量（如最多 10 个），支持输入过滤 |
| AND 查询性能随风格数量增加 | 实际使用中风格数量有限（通常 2-5 个），可接受 |
