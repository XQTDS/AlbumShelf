# 风格库重复行合并与写入路径归一化

## 背景

本地 `genre` 表 2203 行 = MB 官方词表 2201 行 + **2 行历史脏数据**。两行都有一个「持有 MB UUID 的双胞胎」，属于同名（忽略大小写/空白后）重复：

| 脏行 | 名字 | mb_genre_id | 挂载专辑 | 双胞胎 |
| --- | --- | --- | --- | --- |
| id 6160 | `choral symphony\n`（末尾带换行） | 无 | 5 张（上海彩虹室内合唱团 ×4、Brian Eno《Music For Airports》） | id 12124 `choral symphony`（有 UUID，**0 张专辑**） |
| id 13516 | `impressionism`（小写） | 无 | 1 张（Aphex Twin《Drukqs》） | id 6214 `Impressionism`（有 UUID，2 张专辑） |

**根因是两条写入路径的归一化口径不一致**：

- **风格库同步**（`mergeGenreLibrary`）建 `name.toLowerCase()` 索引做去重，认得出 `Impressionism`，于是把 UUID 补写到该行，且按设计「不改 name、不改 id、不删行」—— 脏行被原样保留。带换行的行因 key 含 `\n` 认不出，同步另插了一行干净的（id 12124），脏行成为孤儿。
- **专辑写入路径**（`setAlbumGenres`，手动编辑与数据补全共用）用 `INSERT OR IGNORE INTO genre (name) VALUES (?)` + `SELECT id FROM genre WHERE name = ?`，**大小写敏感、不 trim、不折叠空白**。于是 2026-09-15 新加《Drukqs》自动补全时，MB 返回的小写 `impressionism` 找不到已存在的 `Impressionism`，新建了 id 13516（同专辑其余 6 个风格均已存在、带 UUID，只有它没有）。

**影响**：风格统计与手动编辑候选里出现两个近乎同名的选项；`choral symphony` 的干净行是空壳而专辑挂在带换行的脏行上（界面上风格名带一个不可见换行），且该行没有 MB 来源标记。全库扫描确认只有这两组重复。

## 目标

- **一次性合并历史重复行**：把脏行上的专辑关联改指到持有 UUID 的双胞胎，然后删除脏行。合并后不丢失任何一张专辑的风格关联。
- **修复写入路径**：`setAlbumGenres` 的名称匹配改为「trim + 折叠连续空白 + 忽略大小写」，未命中才建档，且以归一化后的名字建档 —— 从源头杜绝同类重复再生。
- **启动时自动执行、幂等**：迁移随 `initDatabase()` 跑，已有安装无需手工干预；无重复时零写入。
- 风格库同步的去重键与专辑写入路径共用同一套归一化规则（口径统一）。

## 非目标

- **不改同步路径的「只增不改不删」不变量**：`mergeGenreLibrary` 依然不 DELETE、不改 name/id（仅同步路径受此约束；本次的一次性迁移是明确例外，见 design.md 第 5 节）。
- **不做风格知识图谱的「人工确认合并」UI**：不新增合并界面，只处理程序可判定的重复（归一化后同名）。
- **不补写 UUID 到已存在的脏行**：脏行是被合并掉的一方，其来源标记问题随删除一并消失；合并后胜者本就带 UUID。
- **不为补全路径写入 `mb_genre_id`**：MB lookup 返回的 genre 对象虽带 `id`，但本次不改 `fillAlbumGenresIfEmpty` 的签名与载荷；未带 UUID 的新建档行会在下次风格库同步时被补上来源标记（既有行为）。
- 不做全库风格名的批量规范化改写（如把 `Impressionism` 改成 MB 的小写形式）：改名会破坏 `name UNIQUE` 之外的既有展示习惯，收益仅为美观。

## 能力变更

### Modified Capabilities

- `local-storage`：`genre` 表新增「写入归一化」约束；新增「启动时合并历史重复风格行」的一次性数据迁移
- `genre-library`：明确「只增不改不删」不变量的适用范围为同步路径；去重键定义收敛为共享归一化规则
- `data-enrichment` / `manual-genre-edit`：写入语义补充「同名风格按归一化键复用已有行，不新建重复行」

## 影响

- **主进程**：[database.ts](../../../album-shelf/src/main/database.ts)（新增迁移函数并在 `initDatabase()` 调用）、[album-service.ts](../../../album-shelf/src/main/album-service.ts)（`setAlbumGenres` 归一化匹配；抽出共享归一化 helper，`mergeGenreLibrary` 复用）
- **数据**：`genre` 删 2 行、`album_genre` 改指 6 条关联（无专辑丢风格）；迁移幂等，重跑零写入
- **预加载 / 渲染层**：无改动
- **可观测**：迁移执行时 `console.log` 一行汇总（合并组数 / 删除行数），无重复时静默
