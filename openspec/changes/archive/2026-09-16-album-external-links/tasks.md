# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-09-16-album-external-links/` 变更文档（proposal/design/tasks）

## 主进程（`src/main`）

- [x] `enrich/external-links.ts`（新增）：`ExternalLinkKey` / `ExternalLinks` 类型、`HOST_WHITELIST`、`extractExternalLinks()`（按 host 后缀匹配）、`rymSearchUrl()`
- [x] `database.ts`：`PRAGMA table_info('album')` 迁移分支加 `external_links TEXT`（沿用 `user_rating` / `physical_media` 的迁移约定，建表语句保持 v1 基线不动）；`importDatabase` 的 album UPDATE / INSERT 列清单补 `external_links`（否则导入静默丢字段）
- [x] `album-service.ts`：`Album` 接口加 `external_links: string | null`；`AlbumUpdate` 加 `external_links?`；`updateAlbum` 的动态 SET 分支支持该列；新增 `setAlbumExternalLinks(albumId, links)`
- [x] `enrich/enrich-service.ts`：`matchAlbum` / `processConfirmedMatch` 两处 lookup 的 inc 加 `'url-rels'`；`MbMatchResult` 加 `externalLinks`；匹配成功后写入
- [x] `enrich/enrich-service.ts`：新增 `ensureExternalLinks(albumId)` —— 供惰性回填，读专辑 → 无 mbid 或已回填则直接返回 → lookup `url-rels` → 成功才写库，失败保持 NULL
- [x] `ipc-handlers.ts`：新增 `album:ensureExternalLinks`

## 预加载与渲染层

- [x] `preload/index.ts` / `index.d.ts`：`ensureExternalLinks(albumId)` 及类型定义
- [x] `App.vue`：新增 `externalLinksCache` ref + `albumLinks` 计算属性（RYM 恒显示）
- [x] `App.vue`：选中专辑时调用 `ensureExternalLinks`（不阻塞渲染，返回后更新）
- [x] `App.vue`：`.detail-links` 区域改为按计算属性渲染，补链接样式

## 修订：RYM 入口改为恒用搜索页

用户实测发现指向 RYM release 页的直链点不开（MB 记的 slug 与实际不符，或 RYM 拦截直达），原「有直链用直链、无直链降级搜索页」的方案作废。

- [x] `App.vue`：`albumLinks` 的 RYM 项改为无条件 `rymSearchUrl(album.artist, album.title)`，不再读 `external_links.rym`
- [x] `album-detail-expand` spec：RYM 的两个 scenario（直链 / 搜索兜底）合并为「RYM 入口恒为搜索页」
- [x] `data-enrichment` spec：注明 `rym` 字段照常采集但无消费方
- [x] design.md 第 4/5/6/8 节随修订更新，记录遗留风险（搜索页同域，若整域拦截需退到 Google 站内搜索）
- [x] proposal.md 目标与方案概述同步修订

## 收尾

- [x] 更新 spec：`local-storage`、`album-detail-expand`、`data-enrichment`（见 design.md 第 7 节）
- [x] README 同步（详情面板外链说明）
- [x] 抽取逻辑实测验证（真实 MB 响应 17 条关系 → 精确抽出 4 个白名单站点；边界用例：undefined / 空数组 / 畸形 URL / 子域 / 白名单外 / 同站多条 全部正确）
- [x] 用户手动 `npm run dev` QA（2026-09-16 通过；**RYM 搜索页实测可打开**，方案成立）
- [x] 归档 change 到 `openspec/changes/archive/`
