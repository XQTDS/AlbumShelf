# 任务清单

## 1. 时区换算工具

- [x] `ncm-cli-service.ts` 导出 `publishTimeToReleaseDate(publishTime)`，按北京时间（UTC+8）换算日期字符串
- [x] `ncm-cli-sync-service.ts` 的 `toNeteaseAlbum` 改用共享函数

## 2. 数据层

- [x] `album-service.ts` 新增 `getAlbumsWithoutReleaseDate()`：`release_date IS NULL/''` 且 `netease_album_id` 非空，id 倒序

## 3. 批量回填 IPC 与菜单

- [x] `ipc-handlers.ts` 新增 `album:releaseDateFillStart`：重入保护、登录前置检查、逐张 `getAlbumDetail` 取 `publishTime` 写入空日期、300ms 限流、登录失效中止、进度事件 `album:releaseDateFillProgress`
- [x] `index.ts` 菜单「数据」新增「补全缺失发行日期」，发送 `menu:releaseDateFill`

## 4. 搜索添加路径

- [x] `AlbumSearchModal.vue` `handleAdd` 传 `publish_time`
- [x] `ipc-handlers.ts` `album:addToCollection` 接受可选 `publish_time` 并透传
- [x] `sync-manager.ts` `syncSingleAlbum` 写入 release_date（不再硬编码 null）

## 5. 单张重新同步

- [x] `ipc-handlers.ts` `album:resync` 第 1 步：`release_date` 为空时用 `publishTime` 填充

## 6. preload 与渲染层

- [x] `preload/index.ts` 新增 `albumReleaseDateFillStart`、`onReleaseDateFillProgress`、`onMenuReleaseDateFill`
- [x] `preload/index.d.ts` 同步类型
- [x] `App.vue` 新增回填进度条、`handleReleaseDateFill`、菜单监听

## 7. 规范与文档

- [x] 更新 `openspec/specs/data-sync/spec.md`（北京时间换算、回填 requirement、单张同步写入日期）
- [x] 更新 `openspec/specs/ncm-cli-adapter/spec.md`（新增 album get 专辑详情 requirement）
- [x] 归档 change 并同步 README
