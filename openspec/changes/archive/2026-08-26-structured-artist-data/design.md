# 设计：艺术家结构化存储

## 现状

- `album.artist TEXT NOT NULL`：`/` 拼接名字串（同步链 `join('/')`、在线添加 `join(' / ')`、回填不动文本）。
- `album.artist_ids TEXT`：JSON `[{originalId, id}]`，无 name，与「按 `/` 拆分的名字」下标对齐。已提交（1dcf849）但**从未随版本发布**（最新 release v1.0.5）。
- 迁移机制：无 version 字段，PRAGMA table_info 检查 + ALTER ADD COLUMN（database.ts:91-127）；better-sqlite3 ^12.8.0（SQLite ≥3.45，支持 DROP COLUMN）。
- 「已存在不改动」不变量：insertAlbum 对已存在 netease_album_id 直接返回；SyncManager 查重跳过 → 存量升级只能靠回填任务。
- 回填任务 `album:artistIdFillStart`：ncm-cli `album get` 返回的 `detail.artists` **含 name**，当前只提取 ID 写 artist_ids（name 被丢弃）。

## 方案

### 数据模型

`album.artists TEXT`：JSON `[{name, originalId, id}]`，NULL = 未回填。`id` 为网易云加密 ID（沿用现有载荷键名）；渲染层映射为 `{name, originalId, encryptedId}`（popover 链路已消费此形态，零改动）。

`artist` 文本列保留：仅在三个写入点从同一 `artists` 数组派生（函数内相邻两行，不漂移），统一 `' / '`。保留理由：queryAlbums 搜索 `LOWER(a.artist) LIKE` 走 SQL；enrich-service 与 artist-alias 以整串文本为 MB 查询/别名 key；Album 类型跨 IPC 为公开契约。

### 解析真源 album-artist.ts（新建，主进程）

```ts
export interface AlbumArtistRef { name: string; originalId: number | null; id: string | null }
export function splitArtistText(artist: string): string[]  // 自 followed-artist-service 迁入，语义不变
export function parseAlbumArtistsJson(artists: string | null): AlbumArtistRef[] | null
// NULL/空串/损坏 JSON/空数组/无有效 name → null
export function albumArtistRefs(row: { artist: string; artists: string | null }): AlbumArtistRef[]
// parseAlbumArtistsJson 非 null 直接返回；否则 splitArtistText 映射 name、ID 全 null
```

回退约束：**读时不写库、不猜数据**；回退路径 ID 一律 null（与今天未回填行一致，follow 的 COALESCE 语义不变）。followed-artist-service 改为 `export { splitArtistText } from './album-artist'` 保持既有 import 兼容。

### 读方改造

- `queryAlbums` 预计算块：`SELECT id, artist, artists`，行内名字 `albumArtistRefs(r).map(a => a.name)`；search LIKE 继续打文本列。
- `getAllArtists`：`SELECT DISTINCT artist, artists` + albumArtistRefs flatMap 去重排序。
- `FollowedArtistService.list()` album_count 与 `fillMissingIdsFromAlbums()`：改读 albumArtistRefs；fill 改为「遍历专辑结构化列表、按 name 精确匹配取 ID」——顺带修复旧 indexOf 对齐对含 `/` 名字（如 AC/DC）永远找不到的 bug。

### 回填任务

- guard：`artists IS NULL OR ''`（`getAlbumsWithoutArtists`，改名）。
- 逐张 `album get` → `updateAlbum(id, { artists: JSON.stringify(...), artist: detail.artists.map(a => a.name).join(' / ') })`——**重写文本**修复存量坏文本（存量行无手动编辑入口，重写无风险；否则结构化修了、搜索/enrich 仍是坏的）。
- 防重入、300ms 限流、进度事件、登录失效中止、末尾 fillMissingIdsFromAlbums 编排不动；IPC 通道名保留（未发布，改名无价值）。

### 迁移与清理

- CREATE_ALBUM_TABLE 加 `artists TEXT`；迁移块：缺 artists 则 ADD COLUMN；存在 artist_ids 则 `try { DROP COLUMN } catch { console.warn }`（best-effort，残留无害）。
- 不做 artist_ids → artists 预迁移：旧对齐逻辑会固化 AC/DC 类错名且 guard 判定非空后不再修复；直接 DROP + 回填重取（该数据仅存在于开发机）。

### 导出/导入 v2 就地重定义

- 导出 `SELECT *` 自动随行含 artists；import UPDATE/INSERT 列清单 `artist_ids`→`artists`（`?? null` 兜底）；旧开发版 v2 文件的 artist_ids 键被显式列清单自然忽略，导入后 artists 为 NULL 的行由回填任务兜住。更新版本注释。

## 实施顺序（每步独立可验证）

1. OpenSpec 骨架（纯文档）
2. DB 层加 artists（暂不删 artist_ids）
3. 同步链写 artists（artist_ids 写入随 NeteaseAlbum 类型切换一并移除，实现中未保留两列并存）
4. 主进程读路径切结构化优先回退 + getAlbumsWithoutArtists
5. 回填任务升级（写 artists + 重写文本 + guard 切换）
6. 渲染层 helper/类型/载荷切换
7. 清理：DROP COLUMN + export/import + 残余引用清零
8. OpenSpec specs 合并 + 归档

已知短暂回退窗口：步骤 4 后 6 前，开发机旧库「已回填 artist_ids 但 artists 为 NULL」的行渲染层短暂失去 ID（回退路径 ID 为 null），步骤 5 回填后恢复；该窗口仅存在于开发者本机。
