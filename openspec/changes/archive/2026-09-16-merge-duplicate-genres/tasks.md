# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-09-16-merge-duplicate-genres/` 变更文档（proposal/design/tasks）

## 主进程（`src/main`）

- [x] `album-service.ts`：新增并导出 `normalizeGenreKey(name)`（trim + 折叠连续空白 + 小写）
- [x] `album-service.ts`：`setAlbumGenres` 改为「归一化索引匹配 → 未命中才建档」，建档写入归一化后的名字，空名跳过，同批内去重
- [x] `album-service.ts`：`mergeGenreLibrary` 的去重键改用 `normalizeGenreKey`（替换裸 `toLowerCase()`），保持同步路径行为与写入路径口径一致
- [x] `database.ts`：新增 `mergeDuplicateGenres(db)`（分组 → 胜者优先有 UUID / 并列取最小 id → 改指关联 → 删旧关联 → 删行，单事务、幂等、有合并时打印一行日志）
- [x] `database.ts`：`initDatabase()` 迁移段末尾调用 `mergeDuplicateGenres(db)`

## 收尾

- [x] 更新 spec：`local-storage`（新增启动期合并重复风格行的 requirement）、`genre-library`（「只增不改不删」不变量显式限定为同步路径）、`data-enrichment` / `manual-genre-edit`（写入按归一化键复用已有行）
- [x] README 同步（风格库相关条目补充归一化去重与启动期合并说明）
- [x] 用户手动 `npm run dev` QA（见 design.md 第 6 节）：迁移生效、幂等、写入归一化、同步回归
- [x] 用户核对本地库合并结果（`genre` 2203 → 2201，5 张 choral symphony 专辑与《Drukqs》风格展示正常）
- [x] QA 通过后归档 change 到 `openspec/changes/archive/`
