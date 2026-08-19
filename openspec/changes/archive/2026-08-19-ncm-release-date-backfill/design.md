# 设计

## 现状

`release_date` 的写入路径只有两条：

- **同步新增**（`NcmCliSyncService.toNeteaseAlbum`）：`album collected` 的 `publishTime` 经 UTC 换算写入，仅对新增专辑生效；
- **MB 补全**（`EnrichService`）：匹配成功时写入 MB `first-release-date`，失败时仅标记 `enriched_at`。

历史 CSV 导入的专辑两条路径都未产生日期：MB 匹配失败（中国独立音乐在 MB 上缺失常见），而 ncm-cli 数据因「已存在专辑不改动」从未回填。

## 方案

### 1. 时区换算工具（修正既有差一天的 bug）

`publishTime` 是北京时间零点的毫秒时间戳，直接 `toISOString().split('T')[0]` 得到的是 UTC 日期，比网易云展示的发行日期早一天。

在 `ncm-cli-service.ts` 导出共享函数：

```ts
/** 将 ncm publishTime（北京时间零点的时间戳）换算为北京日历日期，如 "2014-09-25" */
export function publishTimeToReleaseDate(publishTime: number): string {
  const BJ_OFFSET_MS = 8 * 60 * 60 * 1000
  return new Date(publishTime + BJ_OFFSET_MS).toISOString().split('T')[0]
}
```

`NcmCliSyncService.toNeteaseAlbum` 改用此函数（修正新同步数据差一天的既有问题）。

### 2. 批量回填（菜单「补全缺失发行日期」）

完全复用批量补封面（`album:coverFillStart`）的模式：

- **查询**：`AlbumService.getAlbumsWithoutReleaseDate()` —— `release_date IS NULL/''` 且 `netease_album_id` 非空，按 id 倒序；
- **IPC**：`album:releaseDateFillStart`（重入保护 + 登录前置检查，未登录触发登录弹窗）、进度事件 `album:releaseDateFillProgress`（current/total/albumTitle/filled）；
- **处理**：逐张 `getAlbumDetail(album.netease_album_id)`，`publishTime` 存在则 `publishTimeToReleaseDate` 后写入，否则计入 failed；登录失效（`handleLoginRequiredError`）中止并弹登录窗；每次调用间隔 300ms 限流；
- **增量收敛**：只查空日期的专辑，失败不重试，重跑自然收敛——与封面补全一致。

### 3. 搜索添加写入发行日期

搜索接口 `search album` 的返回已含 `publishTime`（渲染层 `SearchAlbum` 类型已有该字段），当前链路丢弃了它：

- `AlbumSearchModal.handleAdd` 传 `publish_time`；
- `album:addToCollection` handler 接受可选 `publish_time`，透传给 `syncSingleAlbum`；
- `SyncManager.syncSingleAlbum` 写入 `release_date: publishTimeToReleaseDate(publish_time)`，不再硬编码 `null`。

### 4. 单张重新同步补日期

`album:resync` 第 1 步（重新获取封面）中，`getAlbumDetail` 返回的 `publishTime` 在 `release_date` 为空时一并写入。**仅填充空值**，不覆盖 MB 补全或用户已有的日期。

### 5. 不回填策略

- 已有 `release_date` 的专辑在所有路径中均不被 ncm 数据覆盖（MB `first-release-date` 语义为原版首发，与网易云版本日期可能不同，保持现状优先级）；
- 回填与 MB 补全互不干扰：回填不重置 `enriched_at`，补全失败专辑（`enriched_at` 已标记）不重跑 MB，只补日期。

## 影响面

- `album-shelf/src/main/ncm-cli-service.ts`：新增 `publishTimeToReleaseDate`；
- `album-shelf/src/main/sync/ncm-cli-sync-service.ts`：改用共享换算；
- `album-shelf/src/main/sync/sync-manager.ts`：`syncSingleAlbum` 支持 release_date；
- `album-shelf/src/main/album-service.ts`：新增 `getAlbumsWithoutReleaseDate`；
- `album-shelf/src/main/ipc-handlers.ts`：新增回填 IPC、resync 补日期、addToCollection 透传；
- `album-shelf/src/main/index.ts`：菜单新增「补全缺失发行日期」；
- `album-shelf/src/preload/index.ts` / `index.d.ts`：新增 API 与类型；
- `album-shelf/src/renderer/src/App.vue`：回填进度条与菜单监听；
- `album-shelf/src/renderer/src/AlbumSearchModal.vue`：添加时传 publish_time。
