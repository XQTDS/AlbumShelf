# 专辑封面图片显示

## 概述
在专辑详情展开区域的左侧显示专辑封面图片。封面 URL 通过 `ncm-cli album get` 命令从网易云音乐获取 `coverImgUrl` 字段。

## 变更范围

### 新增
- `NcmCliService.getAlbumDetail()` — 获取专辑详情（含封面 URL）
- `NcmCliAlbumDetail` 接口类型
- `album:fetchCover` IPC handler — 获取并持久化封面 URL
- `albumFetchCover` preload API
- 前端 `loadCover()` / `fetchCoverFromRemote()` 函数
- `coverErrorSet` / `coverFetchedSet` 响应式状态

### 修改
- `App.vue` 模板：封面 `<img>` 仅在展开时渲染（`v-if="expandedAlbumId === album.id"`），避免未展开时触发无效图片请求
- `App.vue` 模板：封面加载失败时显示 💿 占位符（`v-else`），并自动调用 `fetchCoverFromRemote` 从 ncm-cli 获取真实 URL
- `electron.vite.config.ts`：开发模式 CSP 放宽 `img-src` 允许加载网易云图片
- `src/main/index.ts`：生产环境通过 `onHeadersReceived` 设置 CSP，移除已有 CSP header 避免大小写冲突
- `ipc-handlers.ts`：`album:fetchCover` 支持 `force` 参数，http→https 自动转换

## 涉及文件
- `album-shelf/src/main/ncm-cli-service.ts`
- `album-shelf/src/main/ipc-handlers.ts`
- `album-shelf/src/main/index.ts`
- `album-shelf/src/preload/index.ts`
- `album-shelf/src/preload/index.d.ts`
- `album-shelf/src/renderer/src/App.vue`
- `album-shelf/electron.vite.config.ts`
