# 设计：封面图片本地缓存

## 1. 存储布局

- 新增 `src/main/cover-cache.ts` 模块，缓存目录为 `app.getPath('userData')/covers/`
- 文件命名 `<albumId>_<urlHash>.<ext>`：
  - `urlHash` = cover_url 的 SHA-1 前 12 位。URL 变化 → 哈希变化 → 自然生成新缓存文件（自失效），无需数据库记录缓存状态
  - `ext` 取自 URL 路径后缀（jpg/jpeg/png/webp/gif），无后缀时回退 `.jpg`（Response 的 Content-Type 由实际下载结果决定，文件后缀不影响渲染）
- 写入新缓存文件后，删除同专辑（`<albumId>_` 前缀）的其他旧文件，避免 URL 变更后残留
- 与 `settings.json`、`window-state.json` 的「userData + 文件」模式一致；图片文件与 SQLite 分离，库文件不膨胀

## 2. cover:// 协议

- 渲染层图片地址统一为 `cover://album/<albumId>`，主进程 `protocol.handle('cover', ...)` 处理：
  1. 解析 albumId → 查库取 `cover_url`（新增 `AlbumService.getCoverUrlById`，只查单列，不附带 genres 查询）
  2. 计算缓存路径，文件存在 → `net.fetch(file://路径)` 直接返回（Electron 官方推荐模式）
  3. 未命中 → `net.fetch(cover_url)`（15s 超时）下载 → 写入缓存目录 → 清理旧文件 → 返回 Response（Content-Type 取下载响应值，默认 image/jpeg）
  4. 任何失败（专辑不存在 / 无 URL / 下载失败 / 超时）→ 返回 404，由渲染层回退
- 并发去重：同一 albumId 的进行中下载用 `Map<number, Promise<Response>>` 共享同一个 Promise，列表与详情面板同时请求同一封面时只下载一次
- 协议注册：
  - `protocol.registerSchemesAsPrivileged([{ scheme: 'cover', privileges: { standard, secure, supportFetchAPI, stream } }])` 在模块顶层执行（import 时先于 `app.whenReady`，满足注册时机要求）
  - `registerCoverProtocol()` 在 `app.whenReady` 中、`initDatabase()` 之后调用
- 缓存目录无 DB 写入竞争：better-sqlite3 同步查询，写盘用 `mkdirSync` + `writeFileSync`，同一 albumId 由去重 Map 保证不并发写同一路径

## 3. CSP

- `index.ts` 中 CSP 的 `img-src` 增加 `cover:`：`img-src 'self' data: https: http: cover:`
- 其余 CSP 项不变

## 4. 渲染层回退链

`App.vue` 封面加载依次尝试三级，失败逐级降级：

1. `cover://album/<id>`（本地缓存，离线可用）
2. 远程 `cover_url`（协议下载失败时，如离线且未缓存）
3. 💿 占位 + 现有 `fetchCoverFromRemote` 补全流程（远程也失败时，行为与现状完全一致）

实现：

- 新增 `coverProtocolFailed` Set：协议加载失败后标记，`coverSrc(album)` 对已标记专辑直接返回远程 URL
- `onCoverError` 改造：协议阶段失败 → 标记 `coverProtocolFailed`（img 因 src 变化自动重渲染为远程 URL）；远程阶段失败 → 走现有 `coverErrorSet` + `fetchCoverFromRemote` 逻辑
- `fetchCoverFromRemote` 成功拿到新 URL 后，清除该专辑的 `coverProtocolFailed` 标记，下次渲染重新走协议（新 URL 会自然触发新缓存下载）

## 5. 代码改动

- 新增 `src/main/cover-cache.ts`：缓存路径计算、`registerCoverProtocol()`、下载去重、旧文件清理
- `src/main/album-service.ts`：新增 `getCoverUrlById(id): string | null`
- `src/main/index.ts`：import cover-cache（模块副作用完成 scheme 注册）、whenReady 中调用 `registerCoverProtocol()`、CSP img-src 增加 `cover:`
- `src/renderer/src/App.vue`：`coverSrc()` 函数、`coverProtocolFailed` 状态、`onCoverError` 分级回退、两处 img 的 `:src` 替换
- preload 无需改动（协议由主进程直接处理，渲染层不新增 IPC）

## 6. Spec 更新

- `openspec/specs/local-storage/spec.md` 新增「封面图片本地缓存」Requirement（存储位置、命名规则、协议行为、回退链）
