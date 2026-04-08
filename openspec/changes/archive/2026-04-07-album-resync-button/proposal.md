# 单张专辑重新同步按钮

## 概述
在专辑详情展开区域的外部链接旁添加"🔄 重新同步"按钮，点击后重新获取该专辑的封面、曲目、评分和风格信息。

## 变更范围

### 新增
- `album:resync` IPC handler — 串行执行：封面获取（ncm-cli）→ 曲目重新同步（ncm-cli）→ 评分和风格补全（MusicBrainz）
- `albumResync` preload API
- 前端 `resyncingAlbumId` 状态和 `handleResync()` 函数
- `.btn-resync` CSS 样式（琥珀色 hover 效果）

### 后端逻辑
1. **封面**：调用 `ncm-cli album get` 获取 `coverImgUrl`，http→https 转换后写入数据库
2. **曲目**：先 `deleteTracksByAlbumId` 清空旧曲目，再 `syncTracksByAlbum` 重新拉取
3. **补全**：重置 `enriched_at`、`musicbrainz_id`、`mb_rating` 等字段和风格标签，重新调用 `enrichAlbum`

### 前端行为
- 同步中按钮显示 spinner + "同步中..."文字，禁止重复点击
- 同步完成后刷新封面、曲目缓存和专辑列表

## 涉及文件
- `album-shelf/src/main/ipc-handlers.ts`
- `album-shelf/src/preload/index.ts`
- `album-shelf/src/preload/index.d.ts`
- `album-shelf/src/renderer/src/App.vue`
