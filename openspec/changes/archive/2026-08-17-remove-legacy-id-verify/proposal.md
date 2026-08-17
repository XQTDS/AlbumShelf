# 移除遗留的「专辑 ID 校验与修复」功能

## 背景

「专辑 ID 校验与修复」是为 CSV 导入时代设计的：

- 早期专辑数据来自外部 CSV 文件（含手填的 `netease_id`），ID 可能错误，因此需要校验（逐个调网易云 API 比对标题）与修复（`album:fixId` 更新 ID 并重同步曲目、封面）。
- 2026-08-14 起同步改为直接通过 ncm-cli `album collected` 拉取网易云收藏（[2026-08-14-ncm-collected-albums-sync](../../archive/2026-08-14-ncm-collected-albums-sync/proposal.md)），专辑 ID 直接来自网易云官方接口，不再存在错误来源。
- CSV 导入功能本身早已移除（见 [2026-04-15-csv-album-import](../../archive/2026-04-15-csv-album-import/proposal.md)），应用代码中已无 CSV 相关逻辑；但 ID 校验的全链路（菜单入口、弹窗、IPC handler、service 方法）残留至今。
- 校验功能逐个调用 `album get` API（300ms 限流），对大量专辑既慢又消耗 API 配额，且其修复能力（`updateNeteaseAlbumId`）已无任何触发场景。

## 目标

- 删除「专辑 ID 校验与修复」的完整链路：菜单入口、校验弹窗、preload API、IPC handler 及因此变为死代码的 service 方法。
- 清理 README 中已不存在的「CSV 导入」功能提法。

## 非目标

- 不删除 `openspec/changes/archive/` 下的历史变更文档（作为开发历史保留）。
- 不删除根目录 `data/`、`scripts/md-to-csv.js` 等 gitignored 本地遗留文件（属用户本地数据，与应用代码无关）。
- 不动与在线搜索共享的 `albumSearchOnline`、`albumAddToCollection` 等 API。
- 不改动数据库表结构（`netease_album_id` 字段仍由同步流程写入）。
