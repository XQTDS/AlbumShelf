# 技术方案

## 入口

- 主进程 `index.ts` 的 `buildAppMenu()` 新增顶级「帮助」菜单（置于「设置」之后）：
  - 「关于 AlbumShelf」→ 向渲染进程发送 `menu:openAbout` 事件（沿用 menu → webContents.send → renderer 监听的标准流程）
  - 「访问 GitHub 仓库」→ 直接 `shell.openExternal('https://github.com/XQTDS/AlbumShelf')`（纯 shell 动作，无需经过渲染进程）
- macOS 应用菜单中 `role: 'about'` 项改为自定义 click，同样发送 `menu:openAbout`，保证跨平台行为一致（原默认 about 面板信息为空）

## 版本号获取

- 主进程注册 `ipcMain.handle('app:getVersion')` → `app.getVersion()`（读取 package.json version）
- preload 暴露 `appGetVersion()`；弹窗打开时异步获取并展示 `v1.0.0` 形式

## 弹窗

- 新建 `renderer/src/AboutModal.vue`，深色主题，样式与 `GenreStatsModal` 一致（bg `#1e1e1e`、强调色 `#4fc3f7`）
- 内容分区：
  1. 应用标识：📀 AlbumShelf + 版本号
  2. 功能简介：网易云收藏同步、MusicBrainz 数据补全、专辑级随机播放、多风格/艺术家筛选、唱片墙双视图、评分与热评
  3. 关于作者：爱听歌的游戏开发程序员，习惯按专辑听歌、主用网易云音乐，苦于缺少风格分类/专辑随机播放/专辑筛选，业余时间开发
  4. AI 声明：代码 100% 由 AI 生成（Claude Opus 4.6 + DeepSeek V4 Pro）
  5. 技术栈标签：Electron · Vue 3 · TypeScript · electron-vite · better-sqlite3 · musicbrainz-api · ncm-cli
  6. 底部：「访问 GitHub 仓库」按钮（`window.api.openExternal` 打开）与开发者标识（XQTDS）
- 交互：点击遮罩或 ✕ 关闭；Esc 关闭弹窗本身，且 App 级 Esc 守卫加入该弹窗状态，避免误关详情抽屉（沿用 GenreStatsModal 的 props/emit 模式）

## 涉及文件

- `src/main/index.ts`：菜单 + `app:getVersion` handler
- `src/preload/index.ts` / `index.d.ts`：`appGetVersion`、`onMenuOpenAbout`
- `src/renderer/src/AboutModal.vue`：新建
- `src/renderer/src/App.vue`：挂载弹窗、菜单事件监听、Esc 守卫
