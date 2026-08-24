# 设计

## 现状

- electron-builder 配置（`package.json` 的 `build` 段）：`files` 含 `node_modules/**/*`（收集全部生产依赖）+ ffprobe-static 非目标平台排除项；`asarUnpack: node_modules/**`（ncm-cli 以 `ELECTRON_RUN_AS_NODE` 子进程运行无法读 asar，全量解包）
- 依赖树比对（打包产物 126 个包 vs lockfile 生产依赖树）：无 devDependencies 泄漏，死重均为「合法在生产依赖链上但运行时无引用」
- 主进程打包产物（`out/main/index.js`）仅外部依赖 `better-sqlite3`；渲染层经 Vite 预打包至 `out/`；ncm-cli 子进程依赖树不含 vue/@babel/@biomejs

## 改动

`package.json` 的 `build.files` 增加排除项（沿用既有 `{,/**/*}` 排除目录本身与内容的写法），`build` 段顶层新增 `electronLanguages`：

```
"files": [
  "out/**/*",
  "node_modules/**/*",
  "!**/ffprobe-static/bin/win32/ia32{,/**/*}",   // 既有
  "!node_modules/vue{,/**/*}",                     // 新增：Vite 已预打包，运行时无引用
  "!node_modules/@vue{,/**/*}",                    // 新增：同上（compiler/runtime 全家桶）
  "!node_modules/@babel{,/**/*}",                  // 新增：仅 @vue/compiler-* 依赖的编译链
  "!node_modules/@biomejs{,/**/*}",                // 新增：rate-limit-threshold 误声明的 lint 工具
  "!node_modules/fluent-ffmpeg/coverage{,/**/*}",  // 新增：npm 误发布的覆盖率目录
  "!node_modules/better-sqlite3/deps{,/**/*}",     // 新增：SQLite 合并源码，仅构建时需要
  "!node_modules/better-sqlite3/src{,/**/*}",      // 新增：同上
  "!node_modules/better-sqlite3/binding.gyp",      // 新增：同上
  "package.json"
],
"electronLanguages": ["zh-CN", "en-US"]
```

各排除项依据：

| 排除项 | 原始体积 | 依据 |
|---|---|---|
| vue + @vue | 8.9MB | 渲染层 Vite 预打包；主进程仅 require better-sqlite3；ncm-cli 依赖树不含 vue |
| @babel | 4.2MB | 打包产物中仅 parser/types/helper-*，全部由 @vue/compiler-* 依赖（随 vue 一并排除后无引用方） |
| @biomejs | 32MB | rate-limit-threshold 的 `lib/index.js` 零依赖（实测无任何 require）；该包误把 lint 工具声明进 dependencies |
| fluent-ffmpeg/coverage | 12MB | jest 覆盖率输出目录，无代码引用 |
| better-sqlite3 deps/src/binding.gyp | ~10MB | 仅 node-gyp 编译时需要；运行时保留 `build/Release/better_sqlite3.node`、`lib/`、`package.json` |
| locales 24 语言 → zh-CN/en-US | ~41MB | 应用仅中英文界面 |

## 风险与验证点

- **electron-builder 排除语义**：node_modules 排除 glob 与既有 ffprobe-static 排除同机制（该排除已被实测生效：打包产物中 ffprobe-static/bin 仅剩 win32/x64），风险低
- **@babel 排除的连锁**：若未来引入直接依赖 @babel 运行时的包会被误伤——排除项集中一处、CI 构建失败可见
- **better-sqlite3 排除**：electron-rebuild 产物在 `build/Release/`，不受影响；若未来改走 prebuild-install 路径（prebuilds/ 目录）需同步调整排除项
- **验证点**：
  1. `npm run dist` 后安装包体积下降（预期 ~135MB）
  2. `dist/win-unpacked/resources/app.asar.unpacked/node_modules` 中 vue/@vue/@babel/@biomejs 目录消失、fluent-ffmpeg 无 coverage、better-sqlite3 无 deps/src
  3. 安装后应用完整可用：专辑列表/搜索/同步（better-sqlite3）、ncm-cli 数据命令（登录/收藏/曲目，依赖 fluent-ffmpeg+ffprobe-static 探测）、播放（mpv PATH 注入）——用户 `npm run dev` 验证开发侧不受影响，打包侧随下次发版回归
  4. 界面中英文正常（electronLanguages 裁剪）
