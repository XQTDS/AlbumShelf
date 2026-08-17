# 设计：同步时清理已取消收藏的专辑

## 1. 同步流程（更新后）

```
SyncManager.sync()
  1. fetchCollectedAlbums() → NeteaseAlbum[]（完整拉取，失败则整体中止）
  2. 计算差异：
       onlineIds = 收藏列表的加密 ID 集合
       dbIds     = AlbumService.getCollectedNeteaseIds().albumIds
       missing   = dbIds 中不在 onlineIds 的部分
  3. 新增：online 中数据库没有的 → insertAlbums
  4. 删除：missing → deleteAlbumsByNeteaseAlbumIds（级联清理 track / album_genre）
  5. 返回 { added, skipped, deleted, total }
```

顺序说明：先新增后删除；若新增抛错则删除不会执行，避免"删了却因异常没补上"。

## 2. AlbumService 新增方法

```ts
deleteAlbumsByNeteaseAlbumIds(neteaseAlbumIds: string[]): number
// DELETE FROM album WHERE netease_album_id IN (...)，包在事务中，返回删除行数
```

- 空数组直接返回 0，不执行 SQL
- 删除依赖 `ON DELETE CASCADE`（track、album_genre），无需手动清理子表

## 3. SyncResult 扩展

新增 `deleted: number` 字段，前端提示文案更新为：

`同步完成！新增 X 张，删除 Y 张，跳过 Z 张已存在`（无删除时保持原文案风格）

同步更新：
- `preload/index.d.ts` 的 SyncResult 接口
- `App.vue` handleSync 的结果提示

## 4. 语义决策

- 删除键为加密 ID（netease_album_id），与新增去重一致
- 只删除本次拉取中确认缺失的专辑；拉取中途失败（重试耗尽）→ 抛出错误 → 不删除
- 不做删除确认弹窗；数据库已有备份流程
