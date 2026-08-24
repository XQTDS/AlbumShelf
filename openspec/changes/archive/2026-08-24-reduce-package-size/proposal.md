# 缩小安装包体积：排除运行时死重依赖 + 裁剪多语言包

## 背景

v1.0.3 的 Windows 安装包达 170MB（NSIS LZMA 压缩后），安装后体积 561MB。实测拆解（`dist/win-unpacked`）：

| 组成 | 未压缩体积 | 是否可优化 |
|---|---|---|
| Electron 运行时（exe 194M + locales 43M + LICENSES 15M + DLL 等） | ~291MB | locales 可裁剪 |
| `resources/mpv/mpv.exe`（zhongfly 构建，捆绑播放器） | 114MB | 见「非目标」 |
| `ffprobe-static` win32/x64 ffprobe.exe | 63MB | 不可动（ncm-cli 元数据探测必需） |
| `app.asar.unpacked/node_modules` 其余 | ~88MB | 约 60MB 为运行时完全无引用的死重 |
| 应用代码 `app.asar` | 2MB | — |

死重来源经依赖树比对确认（打包产物 126 个包 vs lockfile 生产依赖树 147 个包，无 devDependencies 泄漏），问题在于这些包合法存在于生产依赖链上，但运行时不会被加载：

1. **vue + @vue 全家桶（8.9MB）**：渲染进程已由 Vite 预打包进 `out/`，主进程打包产物仅 `require("better-sqlite3")` 一个外部模块，ncm-cli 子进程亦不使用 vue。vue 运行时、compiler-sfc、被其拖入的 @babel 编译链（4.2MB）全是死重。
2. **@biomejs（32MB）**：lint 工具 native 二进制，被 `musicbrainz-api → rate-limit-threshold` 依赖链误拉为生产依赖（其运行时 `lib/index.js` 为零依赖，无任何 require），打包进产物纯属浪费。
3. **fluent-ffmpeg/coverage（12MB）**：npm 发布时误带的 jest 覆盖率目录。
4. **better-sqlite3 构建源文件（~10MB）**：`deps/`（SQLite 合并源码 9.7MB）、`src/`、`binding.gyp` 仅 node-gyp 构建时需要，运行时只需 `build/Release/better_sqlite3.node` 与 `lib/`。
5. **locales 43MB → ~2MB**：当前打包全部 24 种语言，应用仅使用中英。

## 目标

在 electron-builder `files` 中排除上述死重，`electronLanguages` 裁剪为 zh-CN/en-US，预计安装包 170MB → ~135MB、安装后体积 561MB → ~450MB。

## 非目标

- **不更换捆绑 mpv 构建**：实测 shinchiro/mpv-winbuild-cmake 20260814 构建的 mpv.exe 为 119,761,408 字节，与 zhongfly 构建的 119,279,104 字节几乎相同（换构建反而 +0.5MB），无体积收益
- 不做 mpv 首次使用时按需下载（与「开箱即播」既有决策冲突，留待后续评估）
- 不排除 `LICENSES.chromium.html`（保留 Chromium 许可合规）
- 不替换 ffprobe-static（静态构建无更小替代）
- 不收窄 `asarUnpack` 策略（不影响安装包大小，单独评估）
- 不排除 `web-streams-polyfill`（8.7MB，`node-fetch → fetch-blob` 依赖；仅老 Node 上才会加载，Electron 36 内置 Node 22 有原生 Web Streams，理论上安全，本轮为控制风险暂不动，留待后续验证）

## 方案

`package.json` 的 `build.files` 增加排除项（vue/@vue/@babel/@biomejs/fluent-ffmpeg coverage/better-sqlite3 构建源文件），新增 `electronLanguages: ["zh-CN", "en-US"]`。
