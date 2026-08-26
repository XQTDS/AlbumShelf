# 设计：多艺术家专辑的筛选修复

## 现状

- 拆分函数 `splitArtistText`（[followed-artist-service.ts](../../../album-shelf/src/main/followed-artist-service.ts)）语义为按 `/\s*\/\s*/` 拆分，渲染层 `splitArtists` 与其同语义（注释已约束「勿改单边」）。
- `queryAlbums` 中 `followedOnly` / `artistPartial` 已走 JS 预计算路径：全表 `SELECT id, artist FROM album` → `splitArtistText` 逐名匹配 → `a.id IN (...)`，注释声明千级库规模全表扫描为微秒级。
- `artist`（下拉筛选）仍走 SQL `a.artist = @artist` 整串等值匹配；`getAllArtists()` 返回整串 DISTINCT。

## 方案

### 1. 筛选建议列表：拆分去重

`getAllArtists()` 对每个 DISTINCT 整串执行 `splitArtistText`，flatMap 后 `Set` 去重、`sort()` 排序（与 SQLite `ORDER BY` 的码点序一致，保持列表稳定可预期）：

```ts
return [...new Set(rows.flatMap((r) => splitArtistText(r.artist)))].sort()
```

渲染层 `filteredArtistSuggestions` 无需改动，输入 "A" 时只会出现单个艺术家名。

### 2. 筛选匹配：并入 JS 预计算路径

删除 `a.artist = @artist` 等值条件，将 `artist` 并入既有预计算块，条件改为 `followedOnly || artist || artistPartial`：

- 单次全表扫描 `SELECT id, artist FROM album`（避免多次扫描）。
- 各条件独立计算命中 id 集合，经 `intersect` 取交集（保持多条件组合的 AND 语义；此前 `artist` 与 `followedOnly` 可组合，等值 + id IN 本就是交集）。
- `artist` 与 `artistPartial` 在 UI 层互斥（`applyArtistPartialFilter` 会清空 `selectedArtist`），语义统一为「拆分后单名匹配」，取 `(artist || artistPartial).trim()` 作为目标名。
- 交集为空时提前返回空结果（沿用现有行为）。

```ts
if (followedOnly || artist || artistPartial) {
  const rows = this.db.prepare('SELECT id, artist FROM album').all() as { id: number; artist: string }[]
  let matchedIds: number[] | null = null
  const intersect = (ids: number[]): void => {
    const idSet = new Set(ids)
    matchedIds = matchedIds === null ? ids : matchedIds.filter((id) => idSet.has(id))
  }
  if (followedOnly) {
    const followedNames = new Set(new FollowedArtistService().getFollowedNames())
    intersect(
      followedNames.size === 0
        ? []
        : rows.filter((r) => splitArtistText(r.artist).some((name) => followedNames.has(name))).map((r) => r.id)
    )
  }
  const singleName = (artist || artistPartial || '').trim()
  if (singleName) {
    intersect(rows.filter((r) => splitArtistText(r.artist).includes(singleName)).map((r) => r.id))
  }
  const finalIds = matchedIds ?? []
  if (finalIds.length === 0) { /* 空结果提前返回，同现状 */ }
  /* finalIds → @aidN 占位符 → a.id IN (...) */
}
```

### 副作用权衡

- 行为变化仅一处：`artist` 从整串等值变为拆分匹配 —— 这正是本次修复目标。`artistPartial` 与 `followedOnly` 组合时行为修正为交集（此前 `artistPartial` 在 `followedOnly` 开启时被忽略），属顺带修正，与新语义一致。
- 大小写仍敏感（SQLite 等值匹配与 JS 字符串比较同为大小写敏感），行为不变。
