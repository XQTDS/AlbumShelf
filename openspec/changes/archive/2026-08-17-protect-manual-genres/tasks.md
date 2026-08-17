# 任务清单

## 1. AlbumService 层

- [x] 新增 `fillAlbumGenresIfEmpty(albumId, genreNames)` 公开方法
- [x] `resetAllEnrichment` 删除 `DELETE FROM album_genre` 语句

## 2. enrich-service 层

- [x] `enrichAlbum` 精确匹配分支改用 `fillAlbumGenresIfEmpty`
- [x] `processConfirmedMatch` 模糊确认分支改用 `fillAlbumGenresIfEmpty`

## 3. resync handler

- [x] `album:resync` 删除 `setAlbumGenres(albumId, [])` 清空行

## 4. 规范收尾

- [x] 更新 `openspec/specs/data-enrichment/spec.md`：新增「风格标签保护」Requirement
- [x] 归档本次 change 至 `openspec/changes/archive/`
