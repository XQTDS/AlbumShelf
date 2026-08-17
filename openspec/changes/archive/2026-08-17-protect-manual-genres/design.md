# 设计：保护手动编辑的风格标签

## 核心原则

在 `AlbumService` 中新增「仅空时填充」方法，自动流程统一改用它；手动编辑路径保持使用 `setAlbumGenres` 原语义（可覆盖/清空）。

## 修改点

### 1. `AlbumService` 新增 `fillAlbumGenresIfEmpty`

```ts
/**
 * 仅在专辑当前没有风格标签时写入（保护手动编辑的风格不被自动流程覆盖）。
 * @returns 是否实际写入
 */
fillAlbumGenresIfEmpty(albumId: number, genreNames: string[]): boolean {
  const existing = this.getGenresForAlbum(albumId)
  if (existing.length > 0) return false
  this.setAlbumGenres(albumId, genreNames)
  return true
}
```

### 2. `resetAllEnrichment` 不再清空风格

- 删除 `DELETE FROM album_genre` 语句。空风格专辑在 album_genre 中本无行，无需清理；非空风格专辑的风格按本需求保留。

### 3. `enrich-service` 两个写入点改用 `fillAlbumGenresIfEmpty`

- `enrichAlbum` 精确匹配分支（保留 `result.genres.length > 0` 守卫）：`setAlbumGenres` → `fillAlbumGenresIfEmpty`
- `processConfirmedMatch` 模糊确认分支（保留 `genreNames.length > 0` 守卫）：`setAlbumGenres` → `fillAlbumGenresIfEmpty`

### 4. `album:resync` 不再清空风格

- 删除 `albumService.setAlbumGenres(albumId, [])` 行；后续 `enrichAlbum` 通过 `fillAlbumGenresIfEmpty` 仅在为空时填充，非空风格自然保留。

## 保留清单

| 项 | 原因 |
|----|------|
| `album:setGenres` handler → `setAlbumGenres` | 手动编辑路径，允许任意覆盖/清空 |
| `enrichAlbum` 中 `mb_rating` / `musicbrainz_id` / `release_date` 写入 | 不受本需求保护 |
| 同步删除专辑的级联清理（data-sync） | 专辑删除语义，非风格覆盖 |

## 行为对照表

| 专辑当前风格 | 精确匹配成功 | 模糊确认 | 重新补全(reset) | 重新同步(resync) | 手动编辑 |
|------|------|------|------|------|------|
| 非空 | 保留原风格 | 保留原风格 | 保留原风格 | 保留原风格 | 覆盖/清空 |
| 空 | 写入 MB 风格 | 写入 MB 风格 | 写入 MB 风格 | 写入 MB 风格 | 覆盖/清空 |

## 风险与验证

- 重新补全/重新同步后，非空风格专辑的 MB 风格不会刷新——这是本需求的有意取舍（风格以用户手动修改为准）。
- 验证点：给一张无 mbid 的专辑手动加风格 → 触发「补全缺失 MB 数据」匹配成功 → 风格应保留；`npm run dev` 手动验证。
