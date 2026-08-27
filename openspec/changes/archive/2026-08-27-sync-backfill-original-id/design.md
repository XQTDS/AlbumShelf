# 技术设计：同步顺带补全网易云跳转 ID

## 1. 现状

- 详情面板跳转链接只认明文专辑 ID：

  ```html
  <!-- App.vue -->
  <a v-if="selectedAlbum.netease_original_id"
     @click.prevent="openExternal('https://music.163.com/#/album?id=' + selectedAlbum.netease_original_id, $event)">
    🎵 网易云音乐
  </a>
  ```

- 同步链路（[sync-manager.ts](../album-shelf/src/main/sync/sync-manager.ts)）对已存在的专辑只跳过：

  ```ts
  const existing = this.albumService.getAlbumByNeteaseAlbumId(album.netease_album_id)
  if (existing) {
    skipped++
  } else {
    albumsToInsert.push(...)  // 新增
  }
  ```

- 而同步源 `ncm-cli album collected` 每条记录都带明文 ID（`NcmCliCollectedAlbum.originalId`，必填 number），`toNeteaseAlbum` 已将其映射到 `netease_original_id`——只是增量去重后这个值对存量专辑被丢弃了。

- 现状数据库分布（userData/album-shelf.db）：
  - NULL 行 2036 张，`synced_at` 全部为 2026-04-16T09:47:16（历史 CSV 批量导入，表头 `title,artist,netease_id`）
  - 非空行 510 张，分布于之后各日（搜索添加等路径）

## 2. 方案

### 2.1 SyncManager 写入阶段收集补全批次

`sync()` 循环中 existing 分支扩展为：

```ts
if (existing) {
  skipped++
  // 顺带补全：本地缺明文 ID 且本次拉取到明文 ID 时收集，循环后批量写回
  if (existing.netease_original_id == null && album.netease_original_id != null) {
    originalIdBackfills.push({
      id: existing.id,
      netease_original_id: album.netease_original_id
    })
  }
}
```

`existing` 为 `Album`（含 `id`、`netease_original_id` 字段），`getAlbumByNeteaseAlbumId` 已返回完整行，无需追加查询。

### 2.2 AlbumService 批量补全方法

新增专用方法（DB 访问收敛在 service 层，仿 `insertAlbums` 事务写法）：

```ts
backfillOriginalIds(rows: { id: number; netease_original_id: number }[]): number {
  if (rows.length === 0) return 0
  const update = this.db.prepare(
    'UPDATE album SET netease_original_id = ? WHERE id = ? AND netease_original_id IS NULL'
  )
  const backfillMany = this.db.transaction((items) => {
    let n = 0
    for (const r of items) n += update.run(r.netease_original_id, r.id).changes
    return n
  })
  return backfillMany(rows)
}
```

- 单个事务内 2000+ 行 UPDATE，本地 SQLite 毫秒级完成。
- `WHERE ... IS NULL` 为第二道防线：即使收集阶段判断与执行之间存在并发写入（当前同步为单进程防重入，实际不存在），也只补空值。

同时给 `AlbumUpdate` 增加 `netease_original_id?: number | null`（与其他回填字段一致，供 `updateAlbum` 复用）。

### 2.3 统计与提示

- `SyncResult` 增加 `backfilled: number`。口径：`skipped` 仍为所有已存在专辑数（含被补全者），`backfilled` 是其子集，`added + skipped == total` 不变量保持不变。
- `App.vue` `handleSync` 完成提示：
  - 现有条件 `added > 0 || deleted > 0` 扩为 `added > 0 || deleted > 0 || backfilled > 0`；
  - 详细文案末尾在 `backfilled > 0` 时追加「，补全 X 张网易云跳转 ID」；
  - 同步后本来就 `fetchAlbums()` 刷新，补全的链接随刷新立即可见。

### 2.4 不改动的部分

- 删除判定、分页、重试、进度推送全部不动（补全发生在既有 writing 阶段收尾，不产生新进度事件）。
- 单张同步（`syncSingleAlbum`）、搜索添加路径不动。
- artists / 封面 / 发行日期等字段对已存在专辑的「不改动」语义不动。

## 3. 边界与防御

- **增量收敛**：补全条件要求本地为空，二次同步补全批量自然收敛为 0；本次拉取缺 ID 的专辑留待下次（与既有回填的收敛思路一致）。
- **不覆盖已有值**：本地已有明文 ID 时一律跳过（`== null` 判断 + SQL `IS NULL` 双保险）。
- **统计可解释性**：提示文案明确区分「跳过（已存在）」与「补全 ID」。

## 4. spec 同步点

`openspec/specs/data-sync/spec.md` 需修订：

- 「手动触发同步」requirement 的「已存在专辑不改动」scenario：增加唯一例外条款。
- 「同步保留结构化艺术家数据」的存量条款措辞同步限定字段范围（同步仍不主动改写 artists）。
- 新增 requirement「同步顺带补全网易云跳转 ID」及对应 scenarios（范围/统计/不覆盖/缺 ID 跳过）。
