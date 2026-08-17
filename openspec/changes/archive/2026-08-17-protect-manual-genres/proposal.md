# 保护手动编辑的风格标签：非空风格列表永不被自动覆盖或清空

## 背景

当前存在多条**自动流程**会覆盖或清空专辑的风格标签（album_genre 关联）：

1. **数据补全匹配成功**：`enrichAlbum`（精确匹配）与 `processConfirmedMatch`（模糊确认）在匹配到 MusicBrainz 后调用 `setAlbumGenres`，先 `DELETE FROM album_genre WHERE album_id = ?` 再写入 MB 风格——会覆盖用户手动编辑的风格。
2. **重新补全所有专辑**：`reEnrichAll` 调用 `resetAllEnrichment()`，其中 `DELETE FROM album_genre` 全表清空所有专辑的风格关联（含手动编辑）。
3. **单张专辑重新同步**（`album:resync` 第 3 步）：先 `setAlbumGenres(albumId, [])` 清空该专辑风格，再重新匹配写入。

手动编辑风格是用户的有意输入（manual-genre-edit 能力），不应被任何自动流程悄悄覆盖或清空。

## 目标

- 任何自动流程（数据补全、重新补全、重新同步）在专辑当前风格列表**非空**时，绝不覆盖或清空其风格标签；风格标签只能通过手动编辑（`album:setGenres`）修改。
- 自动流程仍可在专辑风格列表**为空**时写入 MB 风格（保持原有补全能力）。

## 非目标

- 不限制手动编辑路径（`album:setGenres` 仍可任意覆盖/清空）。
- 不保护 `mb_rating`、`musicbrainz_id`、`release_date` 等字段——它们仍可被自动流程刷新。
- 不改动专辑删除时的级联清理（专辑被同步删除时风格随之删除，属于数据一致性语义）。
