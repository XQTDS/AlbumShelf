# 2026-08-14-ncm-collected-albums-sync

## 背景

AlbumShelf 最初的同步流程依赖手动维护的 `data/album-collection.csv`：因为当时 ncm-cli 尚不支持获取用户收藏的专辑列表，系统从 CSV 读取列表，再通过 `ncm-cli search album` 逐张搜索获取真实 ID（含模糊匹配确认流程）。

ncm-cli 升级到 0.1.6 后，新增了 `album collected` 命令，可直接获取用户收藏的专辑列表。实测验证：

- 返回结构与现有 `search album` 一致：`{code: 200, data: {recordCount, records: [...]}}`
- 每条记录包含加密 ID（`id`）和明文 ID（`originalId`）、专辑名、艺术家数组、封面、发行时间、语言、厂牌
- 全量拉取本账号 2475 张收藏专辑成功，字段完整率 100%，无重复
- 对比发现线上收藏比 CSV 多 125 张，CSV 维护已明显滞后

## 目标

1. 实现 `NcmCliSyncService`（此前预留的 stub），通过 `ncm-cli album collected` 直接拉取收藏专辑列表作为同步数据源
2. 彻底弃用 CSV 流程：删除 CSV 读取、CSV 回写、基于 CSV 的搜索匹配与模糊匹配确认代码
3. 同步时已存在于数据库的专辑（按 `netease_album_id` 去重）仅计数跳过，不修改数据库内容

## 非目标

- 不动 MusicBrainz 补全流程及其模糊匹配确认机制（`FuzzyMatchModal` 属补全流程，保留）
- 不做同步进度条（同步按钮已有加载状态）
- 不删除磁盘上遗留的 `data/album-collection.csv` 等数据文件（用户数据，仅代码流程弃用）
