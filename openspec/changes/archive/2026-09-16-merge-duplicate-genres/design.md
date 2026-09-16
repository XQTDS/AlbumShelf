# 技术设计：风格库重复行合并与写入路径归一化

## 1. 现状

### 1.1 两条写入路径的归一化口径不一致

| 路径 | 位置 | 去重键 | 命中后行为 |
| --- | --- | --- | --- |
| 风格库同步 | `mergeGenreLibrary`（[album-service.ts:603](../../../album-shelf/src/main/album-service.ts#L603)） | `name.toLowerCase()` | 只补写空的 `mb_genre_id`，不改 name/id、不删行 |
| 专辑写入 | `setAlbumGenres`（[album-service.ts:556](../../../album-shelf/src/main/album-service.ts#L556)） | **无**（`INSERT OR IGNORE` + `WHERE name = ?` 精确匹配） | 未命中即按原样建档 |

`setAlbumGenres` 是手动编辑（`album:setGenres`）与数据补全（`fillAlbumGenresIfEmpty`）的共同落点，因此补全写入的 MB 风格名只要与本地已有行的大小写或首尾空白不同，就会新建一行。

### 1.2 SQLite 内建字符串函数的局限

- `lower()` 只处理 ASCII，会漏掉 `afoxé`、`čalgija` 一类名称 —— 这是 `mergeGenreLibrary` 选择在 JS 侧做 `toLowerCase()` 的原因（见其注释）。
- `trim()` 默认只去**空格**，不去换行/制表符 —— 因此 `'choral symphony\n'` 不会被 `trim(name)` 修掉。

结论：归一化必须在 **JS 侧**统一实现，SQL 只负责携带原始行。

## 2. 归一化规则（唯一真源）

```ts
/** 风格名归一化键：去首尾空白 + 折叠连续空白 + 忽略大小写 */
function normalizeGenreKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}
```

置于 `album-service.ts`（与 `AlbumService` 同文件导出，供 database.ts 迁移复用），`mergeGenreLibrary` 与 `setAlbumGenres` 两处统一调用，替换现有的裸 `name.toLowerCase()`。

## 3. 写入路径修复：`setAlbumGenres`

```ts
setAlbumGenres(albumId: number, genreNames: string[]): void {
  const setGenres = this.db.transaction((names: string[]) => {
    this.db.prepare('DELETE FROM album_genre WHERE album_id = ?').run(albumId)

    // 一次性构建归一化索引（2200 行规模，开销可忽略）
    const index = new Map<string, number>()
    for (const row of this.db.prepare('SELECT id, name FROM genre').all() as { id: number; name: string }[]) {
      index.set(normalizeGenreKey(row.name), row.id)
    }

    for (const raw of names) {
      const name = raw.trim().replace(/\s+/g, ' ')   // 建档也写归一化后的名字
      if (!name) continue                            // 空名跳过
      const key = normalizeGenreKey(name)

      let genreId = index.get(key)
      if (genreId === undefined) {
        const info = this.db.prepare('INSERT INTO genre (name) VALUES (?)').run(name)
        genreId = info.lastInsertRowid as number
        index.set(key, genreId)                      // 同批内去重
      }

      this.db.prepare('INSERT OR IGNORE INTO album_genre (album_id, genre_id) VALUES (?, ?)')
        .run(albumId, genreId)
    }
  })

  setGenres(genreNames)
}
```

要点：

- `INSERT OR IGNORE` 换成先查索引再 `INSERT`：避免「大小写不同即新建」，也避免依赖 `name` 的唯一约束兜底（该约束对空白差异无效）。
- 建档写入的是 `trim + 折叠空白` 后的名字，带换行的输入不再入库。
- 同一次调用内重复传入同名（忽略大小写）不会重复建档。
- 索引在事务内每次重建：写入频率低（手动编辑、单张专辑补全），2200 行的构建成本可忽略，换取实现简单。

## 4. 一次性合并迁移

### 4.1 位置

`database.ts` 内新增 `mergeDuplicateGenres(db)`，在 `initDatabase()` 迁移段末尾调用（紧跟 `artist_update` 迁移之后）。文档化的既有迁移惯用法是 `PRAGMA table_info` + 幂等 SQL；本次是数据迁移，同样保持幂等。

### 4.2 算法

```ts
export function mergeDuplicateGenres(db: Database.Database): void {
  const rows = db.prepare('SELECT id, name, mb_genre_id FROM genre ORDER BY id').all()

  // 分组：归一化键 → 行数组
  const groups = new Map<string, { id: number; name: string; mb: string | null }[]>()
  for (const row of rows) {
    const key = normalizeGenreKey(row.name)
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const merge = db.transaction(() => {
    let mergedGroups = 0
    let deletedRows = 0

    for (const group of groups.values()) {
      if (group.length < 2) continue

      // 胜者：优先持有 mb_genre_id 的行；并列取最小 id（保持既有映射稳定）
      const winner = group.find((r) => r.mb) ??
        group.reduce((a, b) => (a.id <= b.id ? a : b))

      for (const loser of group) {
        if (loser.id === winner.id) continue

        // 1) 关联改指胜者（联合唯一约束下用 OR IGNORE 吸收「同一专辑已关联胜者」的冲突）
        db.prepare(
          `INSERT OR IGNORE INTO album_genre (album_id, genre_id)
           SELECT album_id, ? FROM album_genre WHERE genre_id = ?`
        ).run(winner.id, loser.id)
        // 2) 清掉旧关联（必须先于删行，foreign_keys = ON）
        db.prepare('DELETE FROM album_genre WHERE genre_id = ?').run(loser.id)
        // 3) 删行
        db.prepare('DELETE FROM genre WHERE id = ?').run(loser.id)
        deletedRows++
      }
      mergedGroups++
    }
    return { mergedGroups, deletedRows }
  })

  const { mergedGroups, deletedRows } = merge()
  if (mergedGroups > 0) {
    console.log(`[Database] 合并重复风格 ${mergedGroups} 组，删除 ${deletedRows} 行孤儿风格`)
  }
}
```

### 4.3 不变量与边界

- **不丢关联**：改指使用 `INSERT OR IGNORE ... SELECT`，随后才删旧关联与旧行；全程单事务，任一步失败整体回滚。
- **胜者名字不变的代价**：本地 `Impressionism`（大写、带 UUID）胜出，不会改名成 MB 的 `impressionism`。这是非目标（不改 name），且经第 3 节修复后，后续补全写入的小写名会命中它，不再新建。
- **全无 UUID 的重复组**：胜者为最小 id 行，行为同上。
- **空名/纯空白行**：归一化键为空字符串，若出现多行会被并入同一组（胜者取最小 id），不会误删唯一的一行。
- **指向同一专辑的重复关联**：`album_genre(album_id, genre_id)` 为联合唯一，`OR IGNORE` 保证不报错、不产生重复关联。
- **幂等**：迁移后组内只剩一行，再次启动时 `group.length < 2` 全部跳过，零写入。

## 5. 与「只增不改不删」不变量的关系

`genre-library` spec 的不变量原文针对的是**风格库同步路径**：

> 同步路径 SHALL NOT 执行 `DELETE FROM genre`、`DELETE FROM album_genre` 或 `UPDATE genre SET name = ?`

本次迁移是**启动时的一次性数据修复**，不是同步路径，语义上不冲突。但为避免 spec 读者误判，本次改动会：

- 在该 requirement 的描述中把适用范围显式限定为「同步路径」；
- 在 `local-storage` 新增一条独立 requirement 描述「历史重复风格行的启动期合并」，与同步的只增语义并列，互不覆盖。

## 6. 验证方式（用户手动 `npm run dev`）

1. **迁移生效**：启动后库里 `SELECT name FROM genre WHERE name LIKE '%'||char(10)||'%'` 为空；`genre` 行数 2203 → 2201；《Drukqs》仍显示 `impressionism` 风格（1 个，而非 2 个）；5 张 choral symphony 专辑仍带 `choral symphony`。
2. **幂等**：连续启动两次，第二次控制台无合并日志，行数不变。
3. **写入归一化**（可选复现）：对一张空风格专辑手动添加风格、再对另一张专辑添加大小写不同的同一风格 —— 风格库不应出现两行；手动编辑保存后专辑列表与风格统计立即正确。
4. **补全回归**：新加一张专辑触发自动补全，MB 风格正常写入且不产生重复行（观察 `genre` 行数增量为新增风格数）。
5. **风格库同步回归**：菜单「数据 → 同步 MusicBrainz 风格库」重跑，`added` 为 0，行数不变（2201）。
6. **观察期**：若库中原本存在其它未发现的重复组，日志会一次性报告合并组数，可按需核对。

## 7. 归档动作

- 更新 spec：`local-storage`（新增合并迁移 requirement）、`genre-library`（不变量适用范围限定）、`data-enrichment` / `manual-genre-edit`（写入归一化语义）。
- README：数据维护/风格库相关描述补充「风格名按归一化键去重，启动时自动合并历史重复行」一句。
- change 归档至 `openspec/changes/archive/`。
