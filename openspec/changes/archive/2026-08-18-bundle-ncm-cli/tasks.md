# Tasks：将 ncm-cli 内置到 AlbumShelf 安装包

## 1. 安装依赖并锁定版本

- [x] `album-shelf/package.json` dependencies 新增 `"@music163/ncm-cli": "0.1.6"`（精确锁定：代码沉淀了 0.1.6 的行为怪癖，避免版本漂移）
- [x] 新增 npm script：`"ncm-cli": "ncm-cli"`（开发环境配置向导入口）
- [x] `npm install` 更新 package-lock.json（resolved 记录内网镜像地址为预期行为）

## 2. 改造 NcmCliService 执行层

- [x] 新增 `resolveNcmCliEntry()`：`require.resolve('@music163/ncm-cli')` 解析入口；`app.isPackaged` 时将 `app.asar\` 路径段重写为 `app.asar.unpacked\`
- [x] 新增统一执行方法 `execNcmCli(args)`：`execFile(process.execPath, [entry, ...args], { env: {...process.env, ELECTRON_RUN_AS_NODE: '1'}, timeout, maxBuffer, windowsHide })`，无 `shell: true`
- [x] 将 `execute`、`executePlayerCmd`、`getLoginStatus`、`startLogin`、`logout` 五处 execFile 调用收敛到 `execNcmCli`
- [x] 保持所有兼容逻辑不变：JSON 起点定位、`code !== 200`、NcmLoginRequiredError、超时/ENOENT 分支
- [x] 更新错误文案："ncm-cli 未安装或不在 PATH 中，请确认已全局安装 ncm-cli" → 内置 ncm-cli 缺失/启动失败的说明
- [x] `searchAlbum` 移除手动引号包裹（无 shell 后参数直传 argv），更新注释
- [x] 更新类/方法注释中"全局安装"相关表述

## 3. 打包配置（package.json build 段）

- [x] `files` 新增排除：裁剪 `ffprobe-static` 的 darwin/linux/win32-ia32 二进制（实测 CLI 启动探测 ffprobe-static/fluent-ffmpeg 存在性，缺失会静默降级为无数据命令的精简模式，二者必须随包分发；win32/x64 的 ffprobe.exe 61MB 保留）
- [x] 新增 `asarUnpack: ["node_modules/**"]`（npm 将 ncm-cli 依赖提升到顶层 node_modules，只 unpack 子包会导致子进程解析 `Cannot find module 'commander'`；必须整树解包）
- [x] 新增 `extraResources: [{ "from": "build/ncm-configure.bat", "to": "ncm-configure.bat" }]`
- [x] 实测验证：打包产物复制到中性目录（模拟用户机器，无开发机 node_modules 兜底）后，login --check / help 数据命令注册 / search album / album collected 全部正常

## 4. 配置向导辅助脚本

- [x] 新增 `build/ncm-configure.bat`（纯 ASCII + CRLF，避免 cmd 在 chcp 后按字节偏移重读文件导致中文行解析错乱）与 `build/ncm-configure.exe`（C# 控制台子系统启动器，源码 `ncm-configure-launcher.cs`，用系统自带 csc.exe 编译）
- [x] 启动器职责：挂接父进程控制台（AlbumShelf.exe 是 GUI 子系统程序，直接运行不继承控制台，stdin 非 TTY 导致向导拒绝运行）、切换控制台为 UTF-8 代码页（向导中文输出不乱码）、以 `ELECTRON_RUN_AS_NODE=1` 启动 AlbumShelf.exe 执行 unpacked 入口的 `configure` 并透传退出码
- [x] `extraResources` 同时分发 .bat 与 .exe；打包布局实测 `resources\ncm-configure.exe --version` 输出 0.1.6、退出码透传正常

## 5. Spec 更新与归档

- [x] 变更目录下编写 `specs/ncm-cli-adapter/spec.md`（MODIFIED Requirements）
- [x] 实现完成后：将 delta 合并进 `openspec/specs/ncm-cli-adapter/spec.md`，本次 change 归档到 `openspec/changes/archive/`

## 6. 文档同步

- [x] `README.md`：快速开始的"配置网易云同步"移除全局安装步骤，改为内置说明（API Key 一次性配置 + 应用内扫码登录）；技术栈表补充 @music163/ncm-cli（内置）
- [x] `album-shelf/INSTALL.md`：全局安装 ncm-cli 表述改为可选/移除；新增安装包用户配置向导说明（ncm-configure.bat）与源码构建说明（npm run ncm-cli -- configure）；常见问题移除 "ncm-cli: command not found"

## 7. 验证清单（用户手动执行）

> 注：调研过程中为验证 `login --background` 曾触发两次扫码流程且均过期，**本机 ncm-cli 登录状态已被登出**，验证前需先在应用内重新扫码登录。

- [ ] `npm run dev` 开发模式：重新扫码登录后，同步专辑列表、专辑详情（曲目/热评）、在线搜索、封面补全正常
- [ ] `npm run pack` 后运行打包版：在**模拟无 ncm-cli 的 PATH**（临时修改 PATH 或复制目录到另一台无 Node 机器）下，同步、搜索、热评功能正常
- [ ] 登录状态与配置不丢失：打包版登录后，`~/.config/ncm-cli/` 凭证延续，开发版与打包版共用同一登录状态
- [ ] 双击 `resources/ncm-configure.bat` 能打开交互式配置向导
- [ ] 检查安装包体积：排除 ffprobe-static 后 NSIS 安装包应显著减小（约 -336MB 未压缩体积）
- [ ] 确认 `package-lock.json` diff 中仅新增 ncm-cli 依赖树（registry 地址为内网镜像属预期）
