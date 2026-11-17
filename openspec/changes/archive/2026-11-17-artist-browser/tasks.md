# Tasks

## 1. 数据层与地区手动编辑

- [x] 1.1 `database.ts`：`artist` 表新增 `region_source TEXT`；启动时用 `PRAGMA table_info` + `ALTER TABLE` 幂等迁移；`DbArtistRow` 增加字段。
- [x] 1.2 `database.ts`：`ExportData.version` 升为 5；`ImportData` 接受 1–5；artist upsert 增加 `region_source`，实现 manual 优先级（目标 manual 保留；否则入站 manual 写入；否则沿用 COALESCE）。
- [x] 1.3 `database.ts`：`ensureNeteaseArtistIdentity` 的 `mergeNeteaseIntoMbid` / `fillRegion` 遵守 manual：手动行不被自动地区覆盖；合并时源行 manual 则目标继承 manual（含 NULL）。
- [x] 1.4 `artist-service.ts`：`ArtistRow` 增加 `region_source`；新增 `setManualRegion({ neteaseArtistId, name, neteaseEncryptedId, region })`：校验 ID/地区、必要时 INSERT 行、写入 `region`/`country`/`area`/`region_source`，返回更新后的行。
- [x] 1.5 `artist-service.ts`：`upsertArtist` 三个分支在目标行 `region_source = 'manual'` 时不更新 `region`/`country`/`area`/`region_source`。
- [x] 1.6 `region.ts`：新增 ISO alpha-2 地区码列表、`isValidRegionKey`、`listRegionOptions(existing)`（标签复用 `regionLabel`，排序中文优先）。
- [x] 1.7 `database.ts`：导入旧版文件（v1–v3）时，album UPDATE 的 `artists` 使用 `COALESCE(?, artists)`，避免把库中已有结构化艺术家 JSON 抹成 NULL（否则艺人目录退化为文本拆分）。

## 2. 艺人聚合服务

- [x] 2.1 新增 `artist-browser-service.ts`：`ArtistBrowserSummary` / `ArtistBrowserAlbum` 类型。
- [x] 2.2 `buildGroups`：扫描 `album`，`albumArtistRefs` 展开；身份键 `netease:` / `encrypted:` / `name:`；同专辑去重；同名不同 ID 分列；无 ID 名字桶仅与唯一同名 ID 桶合并。
- [x] 2.3 摘要：规范名/别名、地区（严格按 `netease_artist_id`）、album_count / primary_album_count / rated_album_count / average_rating、`is_synthetic`。
- [x] 2.4 `listAlbums(key)`：返回该身份全部专辑（id/title/cover_url/user_rating/release_date/is_primary/artist_text），按 release_date DESC NULL 最后、id DESC。
- [x] 2.5 `getArtist(key)` 与 `getRegionOptions()`（标准 ISO + 库中已有地区）。
- [x] 2.6 单次扫描聚合；注释说明当前千级规模策略与万级演进方向。

## 3. IPC / preload

- [x] 3.1 `ipc-handlers.ts`：初始化 `ArtistBrowserService`；新增 `artistBrowser:list` / `artistBrowser:albums` / `artistBrowser:regionOptions` / `artistBrowser:setRegion` / `artistBrowser:openAlbum` / `artistBrowser:closeWindow`。
- [x] 3.2 `setRegion`：校验 key/ID/地区；无网易云 ID 返回明确错误；成功后返回更新后的 summary，并广播 `artist-region:changed { neteaseArtistId, region, regionLabel }`。
- [x] 3.3 `openAlbum`：校验专辑存在；`getMainWindow()` restore/show/focus/moveTop；转发 `artistBrowser:openAlbum`；主窗口不存在返回错误。
- [x] 3.4 `preload/index.ts` + `index.d.ts`：新增 8 个 API 与 `ArtistBrowserSummary` / `ArtistBrowserAlbum` / `ArtistBrowserRegionOption` 类型。
- [x] 3.5 渲染层组件内本地声明同名接口（renderer tsconfig 不含 preload 全局类型）。

## 4. 窗口与入口

- [x] 4.1 `electron.vite.config.ts`：renderer input 增加 `artists`。
- [x] 4.2 新增 `src/renderer/artists.html`、`src/renderer/src/artists-main.ts`。
- [x] 4.3 `main/index.ts`：`createArtistBrowserWindow`（单实例、900×660、min 720×520、隐藏菜单栏、Esc 由渲染层发送关闭、外链走系统浏览器、dev/prod 加载路径）。
- [x] 4.4 `buildAppMenu` 的「工具」子菜单增加「艺人信息」。
- [x] 4.5 `app.on('activate')` 改为主窗口不存在时重建（支撑 macOS 只剩艺人窗口的场景）。

## 5. 艺人窗口 UI

- [x] 5.1 `ArtistBrowserWindow.vue`：双栏布局、样式 token 复用关注窗口/主界面。
- [x] 5.2 左栏：搜索、排序（专辑数/名字/平均评分）、总数/命中数、艺人行（名字、地区 chip、N 张、★均值(M 张已评)、合成标记、手动标识）。
- [x] 5.3 右栏：艺人头部（名字、地区 + 编辑按钮、专辑数、平均分、合作/主艺拆分）、专辑行（封面三级回退、专辑名、只读星级+数值、发行日期、合作标记）。
- [x] 5.4 地区编辑弹窗：搜索地区、列表、清除、取消/保存；Esc 优先关闭弹窗；无网易云 ID 禁用并提示。
- [x] 5.5 状态：加载中、空库、搜索无结果、加载失败+重试、封面失败占位、跳转失败提示。
- [x] 5.6 刷新：窗口 focus 静默重拉、手动刷新按钮；保留搜索/选中；请求序号防旧响应覆盖。
- [x] 5.7 无障碍：行用 button/role、Enter/Space、focus-visible；地区弹窗焦点管理。

## 6. 主窗口跳转与地区同步

- [x] 6.1 `App.vue`：监听 `artistBrowser:openAlbum`；目标已在列表则选中+滚动；否则清筛选、取消搜索防抖、`selectedAlbumId = null`、fetchAll、确认 found 后选中+滚动；未找到提示。
- [x] 6.2 提取 `clearAllListFiltersForJump()`（含 `followedOnly` / `artistPartial`），并修正既有播放条封面/随机选择路径。
- [x] 6.3 `fetchAlbumsAndScrollTo` 返回 `Promise<boolean>`。
- [x] 6.4 `App.vue`：监听 `artist-region:changed`，更新当前 `albums` 中对应主艺人行的 `region` / `region_label` / `region_area = null`；刷新筛选选项；地区筛选激活时按现有逻辑重载。
- [x] 6.5 清理监听器（onUnmounted），避免重复挂载。

## 7. 规范与文档

- [x] 7.1 新增 `openspec/specs/artist-browser/spec.md`：目录、统计、详情、跳转、窗口、地区编辑、刷新、空态。
- [x] 7.2 更新 `openspec/specs/artist-region/spec.md`：`region_source`、手动覆盖、自动补全不覆盖、清除语义、导出导入。
- [x] 7.3 更新 `openspec/specs/data-enrichment/spec.md`：自动地区补全不得覆盖 manual。
- [x] 7.4 更新 `openspec/specs/local-storage/spec.md`：artist 表新列、导出 version 5、导入 v1–v4 兼容。
- [x] 7.5 更新 `README.md`：功能特性「艺人信息」、地区手动编辑、导出 version 5、项目结构。
- [x] 7.6 归档 change 到 `openspec/changes/archive/2026-11-17-artist-browser/`。

## 8. 验证清单（用户手动 `npm run dev`）

- [x] 8.1 菜单「工具 → 艺人信息」打开独立窗口；重复点击只聚焦；Esc 关闭。
- [x] 8.2 搜索一位没有匹配 MB 的艺人，仍能出现；其专辑无 MB 数据时页面不报错。
- [x] 8.3 某艺人 3 张已评 3.0/4.0/5.0、1 张未评分：显示「平均评分 ★ 4.0（3 / 4 张已评）」；未评分专辑行显示「—」。
- [x] 8.4 合作专辑同时出现在多位艺人下；专辑数 = 列表条数；主艺/参与标记正确。
- [x] 8.5 同名不同 ID（MONO / Ground-Zero）分两行；地区与专辑数不混。
- [x] 8.6 主窗口带搜索/艺术家/风格/地区/已关注筛选时，点击艺人窗口专辑仍能清筛选、定位并打开详情；艺人窗口保持打开。
- [x] 8.7 主窗口最小化时点击专辑能恢复并聚焦；主窗口关闭（macOS）时有明确错误提示/可重建。
- [x] 8.8 手动修改地区：列表与详情立即更新；主窗口专辑地区 chip 与地区筛选项同步；重启后保留。
- [x] 8.9 「重新补全所有专辑」后手动地区不变；手动清除地区后保持「—」，不被自动补回。
- [x] 8.10 导出 JSON 为 version 5 且 artist 含 `region_source`；导入 v4 旧文件正常；v5 往返一致。
- [x] 8.11 `npm run build` 后确认 `out/renderer/artists.html` 存在，打包产物可打开窗口。
- [x] 8.12 约 1700 位艺人列表滚动/搜索无明显卡顿；窗口 focus 刷新不重置搜索与选中。

## 验证记录

- 2026-11-17：用户手动运行 `npm run dev` 验证通过。
