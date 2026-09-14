# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-09-14-sync-mb-genre-library/` 变更文档（proposal/design/tasks）

## 主进程（`src/main`）

- [x] `database.ts`：`genre` 建表语句加 `mb_genre_id TEXT`；`PRAGMA table_info('genre')` 迁移分支；`importDatabase` 的 genre 写入改为带 `mb_genre_id` 的 upsert（`COALESCE` 只补空）
- [x] `album-service.ts`：新增 `GenreLibraryEntry` / `GenreLibraryWriteResult` 类型；新增 `getUsedGenres()`（在用，供筛选），`getAllGenres()` 保留为全量（供 `genre:library`）；新增 `mergeGenreLibrary()`（内存 `lower(name)` 索引 + 事务批量 insert / 补 UUID，**禁 delete 与 rename**）
- [x] `genre-library-service.ts`（新增）：分页 `restGet('/genre/all', { limit, offset })`、页级退避重试（2s/5s/10s，共 4 次）、每页事务落库、进度回调、失败中止返回已完成统计、`syncing` 防重入
- [x] `ipc-handlers.ts`：`genre:librarySyncStart`（`genreLibrarySyncRunning` 防重入 + `genre:librarySyncProgress` 推送）、`genre:library`；`album:filters` 改用 `getUsedGenres()`
- [x] `index.ts`：数据菜单 MB 分组首项「同步 MusicBrainz 风格库」→ `menu:genreLibrarySync`

## 预加载与渲染层

- [x] `preload/index.ts` / `index.d.ts`：`syncGenreLibrary()`、`genreLibrary()`、`onMenuGenreLibrarySync()`、`onGenreLibrarySyncProgress()` 及类型定义
- [x] `App.vue`：`genres` 拆为 `filterGenres` + `genreLibrary`（含启动拉取、编辑态兜底补取）；`filteredGenreSuggestions()` / `genreEditSuggestions()` 改用对应来源
- [x] `App.vue`：`genreEditSuggestions()` 上限 50 条 +「还有 N 个匹配」提示行（含样式）
- [x] `App.vue`：`handleGenreLibrarySync()` + 进度条 UI（复用 `.enrich-bar`）+ 完成汇总提示；菜单事件监听注册与 `onUnmounted` 清理
- [x] `App.vue`：`saveEditGenres` 后刷新 `filterGenres`

## 收尾

- [x] 更新 / 新增 spec（见 design.md 第 7 节：新增 `genre-library`，改 `manual-genre-edit`、`multi-genre-filter`、`local-storage`）
- [x] README 同步（「数据维护」条目补充「同步 MusicBrainz 风格库」）
- [x] 用户手动 `npm run dev` QA（见 design.md 第 6 节，重点：映射不变式、幂等、编辑框可搜到新风格）
- [x] QA 通过后归档 change 到 `openspec/changes/archive/`（2026-09-14）
