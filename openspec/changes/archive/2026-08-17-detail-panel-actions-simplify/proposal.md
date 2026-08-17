# 2026-08-17-detail-panel-actions-simplify

## 背景

详情面板外链操作区包含「重新同步」和「修改网易云 ID」两个按钮。批量 ID 校验（工具栏入口 + IdVerifyModal）已覆盖 ID 修复场景，面板内的单张入口价值低且占用空间，用户决定移除这两个按钮，简化面板。

## 目标

- 移除详情面板中的「重新同步」与「修改网易云 ID」按钮，外链操作区仅保留 MusicBrainz / 网易云音乐外链
- 清理由此产生的前端死代码：`ManualFixIdModal` 组件及引用、相关状态与函数、Esc 守卫条目、`.btn-resync` 样式

## 非目标

- 不动后端：`album:resync` IPC、`album:fixId`、`album:getDetailById` 及 preload API 全部保留（`album:fixId` / `album:getDetailById` 仍被 IdVerifyModal 使用）
- 不动工具栏「校验专辑 ID」入口与 IdVerifyModal 批量校验流程
- 不动面板其余内容（风格、评分、元数据、外链、曲目列表）
