# 设计：将 ncm-cli 内置到 AlbumShelf 安装包

## 1. 调用方式：Electron 内置 Node 执行 CLI 入口

打包后的应用运行在 Electron 内置 Node 上，用户机器没有系统 Node。`node_modules/.bin/ncm-cli` 的 .cmd shim 引用系统 node，不可用。

**方案**：用 `process.execPath`（开发模式 = electron.exe，打包模式 = AlbumShelf.exe）以 `ELECTRON_RUN_AS_NODE=1` 环境变量启动，使其表现为纯 Node 运行时，执行 CLI 的 JS 入口文件（`require.resolve('@music163/ncm-cli')` → package.json `main` 字段 → `dist/index.js`）。

```
execFile(process.execPath, [ncmCliEntry, ...args, '--output', 'json'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  timeout: 15_000, maxBuffer: 10MB, windowsHide: true
})
```

**实测验证（Electron 36.9.5，ncm-cli 0.1.6）**：

| 验证项 | 结果 |
|---|---|
| `--help` / `--version` | ✅ 正常 |
| `login --check --output json` | ✅ 正常，读取 `~/.config/ncm-cli/` 凭证返回已登录状态 |
| `search album --keyword ...` | ✅ 正常（真实网络请求返回 JSON） |
| `album collected --limit 1` | ✅ 正常（登录状态下） |
| `login --background` | ✅ 正常返回二维码 URL，后台轮询子进程启动 |
| PATH 剔除 node 后 `login --background` | ✅ 仍正常（子进程 env 继承 `ELECTRON_RUN_AS_NODE=1`，不依赖 PATH 中的 node） |

**不再需要全局回退**：依赖已入 dependencies，`npm install` 必然提供入口文件，无需"本地开发回退到全局 ncm-cli"的兼容层。若入口缺失（依赖未安装），抛出明确错误。

**spawn 细节**：直接执行 exe 不再需要 `shell: true`（原值是为了让 Windows 经 cmd 执行 .cmd shim）。去掉 shell 后，`searchAlbum` 中针对 shell 解析的手动引号包裹（`"${keyword...}"`）必须移除——无 shell 时参数原样进入 argv，引号会成为值的一部分。Node 的 spawn 会按 Windows 参数规则正确转义含空格的参数。

## 2. asar 限制与打包策略

**实测发现：Electron-as-node 无法读取 app.asar 内的文件**（`ELECTRON_RUN_AS_NODE=1 electron app.asar/test.js` → `MODULE_NOT_FOUND`）。若入口文件留在 asar 内，打包后调用必然失败。

**方案**：electron-builder 配置 `asarUnpack: ["node_modules/**"]`，并在运行时把 `require.resolve` 得到的逻辑路径（`...app.asar\node_modules\...`）重写为真实路径（`...app.asar.unpacked\node_modules\...`），仅当 `app.isPackaged` 时执行重写。

**必须 unpack 全部 node_modules，而非仅 ncm-cli 子树**：npm 默认把依赖提升（hoist）到顶层 `node_modules/`，ncm-cli 的运行时依赖（commander、winston 等）大多位于项目顶层而非其嵌套目录。若只 unpack ncm-cli 子树，子进程的模块解析链会在 `app.asar/node_modules/...`（asar 内，子进程无法读取）处断裂——首个打包版实测报 `Cannot find module 'commander'`。将整个 node_modules 解包后，所有运行时解析都落在真实文件系统上，与 npm 布局无关。

## 3. 依赖树与体积控制

ncm-cli 0.1.6 依赖树分析（基于全局安装与打包实测）：

- **无原生模块**：全部依赖为纯 JS 或静态二进制，不引入新的 electron-rebuild 负担（better-sqlite3 之外无需 rebuild）。
- **ffprobe-static + fluent-ffmpeg 必须随包分发（实测关键发现）**：CLI 启动时探测这两个包的存在性，**任一缺失即静默降级为"精简模式"——manifest 驱动注册的 search/album/comment 等数据命令全部不可用**（表现为 `error: unknown command`，且不写任何日志）。首次打包尝试整体排除它们（约 -336MB）导致打包版数据功能全部失效。最终方案：
  - `fluent-ffmpeg` 完整保留（纯 JS，体积小）
  - `ffprobe-static` 仅保留 win32/x64 的 ffprobe.exe（61MB），通过 files 排除规则裁掉 darwin/linux/win32-ia32 的二进制（约 -275MB）
- **打包 exe 的模块解析被限制在应用资源树内**（实测：dev 版 electron.exe 的解析会沿父目录链向上找到开发机 node_modules，打包版 AlbumShelf.exe 不会），因此依赖必须真实存在于打包产物中，不能依赖外部环境。
- 其余嵌套依赖（commander、winston 等）完整打包。实测 `commander` 为启动必需，winston 负责写 `~/.config/ncm-cli/app.log`。

## 4. ncm-cli 行为约定（保持不变）

现有代码沉淀的怪癖兼容逻辑一律不动，仅替换执行层：

- `album collected` 的 `recordCount` 恒为 0 → 翻页终止继续依赖 records 为空
- stdout 可能有非 JSON 前缀行 → 继续 `indexOf('{')` 定位 JSON 起点
- 15 秒超时、10MB maxBuffer、`code !== 200` 业务错误、登录缺失识别（NcmLoginRequiredError）——全部保留

**调研新发现（无需改代码）**：ncm-cli 的命令注册由服务端 manifest 按登录状态动态门控——未登录时 `search`/`album`/`comment` 等数据命令未注册，返回 `error: unknown command`（无 JSON）。应用在未登录时这些功能本就不可用（现状调用全局 CLI 行为一致），保持现状。

## 5. 凭证与登录状态

ncm-cli 的配置与登录状态存于用户主目录 `~/.config/ncm-cli/`（config.json、credentials.enc.json、tokens.enc.json 等），与安装位置无关。内置调用读取同一位置，**现有用户的配置与登录状态自动延续，无需迁移**。

## 6. configure 配置向导入口

ncm-cli 的数据功能需要网易云开放平台 API Key（appId + privateKey），通过交互式 `ncm-cli configure` 配置。打包版用户没有系统 Node，为此：

- **安装包**：`resources/ncm-configure.bat` 双击入口（纯 ASCII，避免 cmd 代码页切换后多字节中文行被错切执行的解析 bug），实际工作由同目录的 `ncm-configure.exe` 完成——一个 4.6KB 的控制台子系统启动器（C#，源码 [ncm-configure-launcher.cs](../../../album-shelf/build/ncm-configure-launcher.cs)，系统自带 csc.exe 可重编译）。它解决两个实测问题：
  1. **TTY**：AlbumShelf.exe 是 GUI 子系统程序，从 cmd 启动不继承控制台，stdin 非 TTY 导致 ncm-cli 交互式向导拒绝运行（"configure 命令需要交互式终端"）。启动器先 AttachConsole 挂接父进程控制台（失败则 AllocConsole 新建），再以继承句柄方式启动 AlbumShelf.exe，向导获得真实控制台。
  2. **编码**：启动器将控制台切到 UTF-8 代码页（`Console.OutputEncoding = UTF8`），向导的中文/UTF-8 输出正常渲染；bat 自身不含中文，不再依赖 chcp（chcp 会让 cmd 按字节偏移重读文件，UTF-8 多字节字符被拦腰截断后当作命令执行）。
- **开发环境**：开发者本机有 Node，新增 `npm run ncm-cli -- configure`（即 node_modules/.bin 的 shim）。

## 7. npm 镜像约束与发版管线

- 本机 npm registry 为网易内网镜像 `npm.nie.netease.com`，`npm install` 后 lockfile 的 resolved 地址会记录内网地址——**预期行为，不改本地 registry**。
- CI（release.yml）已使用 `npm ci --registry=https://registry.npmjs.org --replace-registry-host=always` 重写 resolved 地址，新依赖自动适配，**workflow 零改动**（contents: write 权限与镜像规避逻辑保持原样）。

## 8. 已知风险与说明

- **后台轮询子进程持有应用 exe 文件锁**：`login --background` 会 spawn 一个 detached 轮询子进程（运行 Electron-as-node），期间占用 AlbumShelf.exe 文件句柄。该子进程在二维码过期（300s）后自行退出，期间卸载/覆盖安装应用可能提示文件占用——与现有行为相比仅从占用 node.exe 变为占用应用 exe，影响窗口有限。
- **`play`/`queue` 播放命令依赖外部 mpv**：与现状一致（ncm-cli 自身行为），不在本次范围内。
- **Electron-as-node 每次调用有进程启动开销**（约数百毫秒）：同步翻页每页一次调用，在 15s 超时与既有重试逻辑内可接受。
