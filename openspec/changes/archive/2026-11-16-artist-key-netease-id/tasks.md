# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-11-16-artist-key-netease-id/`（proposal/design/tasks）
- [x] 冲突分析：本库 1329 个网易云主艺人 ID；41 个 ID 对应多个 MBID（46 张非主专辑），18 个 MBID 对应多个网易云 ID

## 数据层

- [x] `database.ts`：
  - `CREATE_ARTIST_TABLE` 增加 `netease_artist_id` / `netease_encrypted_id`；新增 `idx_artist_netease_id` 唯一索引
  - 新增 `rebuildArtistTable(db)`：旧库 `musicbrainz_artist_id` 仍为 NOT NULL 时在 `foreign_keys=OFF` 下重建，保留所有行与 id
  - album 守卫式迁移增加 `primary_artist_id` 与 `idx_album_primary_artist_id`
  - 新增 `ensureNeteaseArtistIdentity(db)`：解析 `artists[0]`、按网易云 ID 分组、**先按同一实体过滤**、选主 MBID（有地区 → 专辑数最多 → 字典序）、合并已存在的网易云行与未绑定 MBID 行、处理 MBID 占用冲突、创建网易云行、回填 `primary_artist_id`
  - 在 `initDatabase` 末尾调用该迁移
  - `ExportData.version` 升到 4；`ImportData` 接受 1/2/3/4
  - 导入 artist 支持网易云 ID / MBID 两种键，MBID 仅空时填充；album 只写目标库有效 MBID；导入后执行 `ensureNeteaseArtistIdentity`

## 主进程

- [x] `artist-service.ts`：
  - `ArtistRow` 增加 `netease_artist_id` / `netease_encrypted_id`
  - `ArtistRegionInput` 改为网易云主艺人身份 + MB 地区
  - 新增 `getArtistByNeteaseId()`
  - `upsertArtist()` 按网易云 ID 写入；已有地区 first-wins；MBID 被占用时复制地区并将本行 MBID 置空
  - `getUsedRegions()` JOIN 改为 `album.primary_artist_id = artist.netease_artist_id`
- [x] `album-service.ts`：
  - `Album` / `AlbumUpdate` 增加 `primary_artist_id`
  - `ALBUM_SELECT_WITH_REGION` JOIN 改为网易云 ID
  - `insertAlbum` 从 `artists[0].originalId` 写入 `primary_artist_id`
  - 删除 `inferPrimaryArtistFromNeteaseIds` 与 `ArtistLinkInferenceResult`
- [x] `enrich-service.ts`：`buildRegionUpdate` 改为按专辑网易云主艺人 upsert artist，写 `primary_artist_id`；不再写 `primary_artist_mbid`
- [x] `ipc-handlers.ts`：删除 `inferArtistLinks` helper 与全部调用

## 预加载与渲染层

- [x] `preload/index.d.ts`：`Album.primary_artist_id`
- [x] `App.vue`：`Album.primary_artist_id`（仅类型，无 UI 变化）

## Spec、README 与收尾

- [x] 更新 `openspec/specs/artist-region/spec.md`：artist 业务键改为网易云 ID、album `primary_artist_id`、迁移规则、导出 v4；删除上一版「本地推断」requirement
- [x] 更新 `openspec/specs/local-storage/spec.md`：artist/album 字段、迁移、导出导入 v4
- [x] 更新 `openspec/specs/data-enrichment/spec.md`：补全写入网易云键
- [x] 更新 `README.md`：artist 表 key、导出 v4、旧版导入、同一实体校验
- [x] 用本机库副本模拟迁移：验证主 MBID 选择、同名实体过滤、split 行合并、旺福回归、二次迁移零写入

## 审查修复

- [x] `ensureNeteaseArtistIdentity` 增加「网易云行已存在 + 选中 MBID 行未绑定」的合并分支：先合并字段、删除网易云行、再把网易云 ID 挂到 MB 行，避免运行期 UNIQUE 崩溃
- [x] `upsertArtist` 调整分支顺序：先复用未绑定 MBID 行；目标 MBID 已归属另一行（含未绑定历史行）时只复制地区，不写 MBID
- [x] 新增 `isLikelySameArtist`（名称/别名/包含/CJK 重合）：迁移与补全写入地区前校验，群星/作曲家/同名不同人留空
- [x] v4 导入 artist 的 MBID 改为仅空时填充；album 历史 MBID 列只写目标库有效 MBID，避免外键回滚；catch 只处理 MBID UNIQUE
- [x] v3/v1/v2 导入回退使用文件中的旧 MBID（仅当目标 artist 表存在），保证恢复备份后地区关联不丢失
- [x] 修复别名方向：别名文件是「网易云名 → MB 名」，别名作为网易云侧补充名与 MB credit 比较；同时兼容 `album.artist` 全串 key
- [x] 收紧 CJK 匹配：包含关系要求较长名含拉丁；CJK 重合要求同长度且 ≥3 字，避免「李健/李健宏」类误判
- [x] 补全成功时写入有效旧 MBID，辅助启动迁移合并 split 行
- [x] `region_fetched_at` 统一为「首次写入（已有值保留）」语义
- [x] 同步修订 design/proposal/local-storage/artist-region/data-enrichment 与 README
- [x] 用户手动 `npm run dev` 验证（用户确认归档；按项目约定不自动跑 typecheck）
- [x] 归档 change 到 `openspec/changes/archive/`
