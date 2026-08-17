## Why

同步收藏时 ncm-cli `album collected` 接口返回的 `coverImgUrl` 经常为 null（ncm-cli-sync-service.ts:101），加上历史数据，库中大量专辑 `cover_url` 字段为空，详情面板只能显示 💿 占位符。目前仅支持选中专辑时按需拉取封面（一次一张），缺少批量补全手段。

## What Changes

- **新增「补全缺失封面」菜单项**（数据菜单），一键批量补全所有 `cover_url` 为空的专辑
- **批量补全后端**：顺序调用 ncm-cli `album get` 拉取封面 URL 并持久化，带进度推送、登录检查与失败统计
- **进度反馈 UI**：顶部进度条显示当前进度与专辑名，完成后展示成功/失败统计

## Capabilities

### Modified Capabilities

- album-detail-expand: 新增批量补全缺失封面与进度反馈的需求

## Impact

- 后端 IPC：新增 `album:coverFillStatus`、`album:coverFillStart` 通道与 `album:coverFillProgress` 进度事件
- 数据层：AlbumService 新增 `getAlbumsWithoutCover()` 查询方法
- 菜单：index.ts 数据菜单新增「补全缺失封面」项（`menu:coverFill`）
- preload：新增 `albumCoverFillStatus`、`albumCoverFillStart`、`onCoverFillProgress`、`onMenuCoverFill` API
- 前端：App.vue 新增封面补全进度条与菜单事件处理
