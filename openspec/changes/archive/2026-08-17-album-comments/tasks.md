## 1. 后端 - ncm-cli 服务

- [x] 1.1 在 ncm-cli-service.ts 中新增 `NcmCliComment`、`NcmCliCommentListResponse` 类型（content / likedCount / creator / time / liked）
- [x] 1.2 新增 `getAlbumHotComments(albumId: string, limit = 20, offset = 0)`，执行 `comment list-hot --type album --resourceId <id> --limit <n> --offset <m>`

## 2. 后端 - IPC

- [x] 2.1 在 ipc-handlers.ts 中新增 `album:comments` 处理器：查本地专辑 → 无 `netease_album_id` 返回空 → 调用 `getAlbumHotComments` → 头像 URL http→https 转换 → 返回 `{ recordCount, comments }`
- [x] 2.2 失败返回 `{ success: false, error }`，`NcmLoginRequiredError` 附带 `loginRequired: true`

## 3. preload

- [x] 3.1 preload/index.ts 新增 `albumComments(albumId)` API
- [x] 3.2 preload/index.d.ts 新增 `NcmComment` 类型与 `albumComments` 方法声明

## 4. 前端

- [x] 4.1 App.vue 新增评论区块（位于曲目列表下方）：头部「网易云热评（总数）」+ 刷新按钮，正文渲染头像/昵称/内容/点赞数/时间
- [x] 4.2 新增 `commentCache`（Map + fetchedAt）、`COMMENT_CACHE_TTL = 5min`、`loadComments(albumId, force)`、进行中请求去重 Set
- [x] 4.3 选中专辑时按 TTL 自动加载；专辑无 `netease_album_id` 时隐藏区块
- [x] 4.4 加载中 / 空评论 / 失败（含 loginRequired 提示）三种区块内状态；失败可点重试
- [x] 4.5 头像加载失败隐藏 img；时间戳格式化为 YYYY-MM-DD；评论内容 `pre-wrap` 保留换行

## 5. OpenSpec 收尾

- [x] 5.1 将 spec delta 合并进 openspec/specs/album-detail-expand/spec.md 与 openspec/specs/ncm-cli-adapter/spec.md
- [x] 5.2 将 change 归档到 openspec/changes/archive/
- [x] 5.3 同步 README.md（功能特性增加热评展示说明）
