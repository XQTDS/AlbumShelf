## Why

AlbumShelf 目前通过 `child_process.execFile('ncm-cli', ...)` 调用**全局安装**的 ncm-cli。安装包用户必须先自行安装 Node.js 并执行 `npm install -g @music163/ncm-cli`，再完成 `configure` 与 `login`，才能使用同步、收藏拉取、热评等核心功能——对普通用户门槛过高。

本次改造将 @music163/ncm-cli 作为项目依赖内置进安装包，由应用通过 Electron 内置 Node 运行时直接执行 CLI 的 JS 入口，实现安装包完全自包含：用户无需预装 Node.js 和 ncm-cli。

## What Changes

- **内置依赖**：`@music163/ncm-cli`（锁定 0.1.6）加入 album-shelf 的 dependencies，随 electron-builder 打包进安装包
- **调用方式改造**：NcmCliService 不再调用 PATH 中的 `ncm-cli`，改为以 `ELECTRON_RUN_AS_NODE=1` 用 `process.execPath` 启动 Electron 作为 Node 运行时，执行 `require.resolve('@music163/ncm-cli')` 得到的 CLI 入口文件
- **打包配置**：asarUnpack ncm-cli 包（Electron-as-node 子进程无法读取 app.asar 内文件）；排除仅 TUI 播放器使用的 ffprobe-static（约 336MB 二进制）
- **配置向导辅助**：随安装包附带 `ncm-configure.bat`，让无 Node 环境的用户也能完成一次性 `ncm-cli configure`（API 凭证配置）；开发环境提供 `npm run ncm-cli -- configure`
- **文档同步**：README.md 与 INSTALL.md 移除"需全局安装 ncm-cli"的要求，改为内置说明

## Capabilities

### Modified Capabilities

- `ncm-cli-adapter`: 调用方式从"全局安装的 ncm-cli 命令行"改为"应用内置的 ncm-cli（Electron 内置 Node 执行）"，调用失败场景表述同步更新

## Non-goals

- 不改造 ncm-cli 本身（不动其代码与凭证存储位置）
- 不引入新的同步实现（不直接调网易云 API 替代 CLI）
- 不在应用内新增 API Key 配置 UI（继续使用 ncm-cli configure，仅提供调用入口辅助）
- 不处理代码签名、自动更新等与本次无关的发版事项

## Impact

- **主进程**：[ncm-cli-service.ts](../../../album-shelf/src/main/ncm-cli-service.ts) 的 execFile 调用收敛为统一的 Electron-as-node 执行层；移除 `shell: true`（直接执行 exe 不再需要 cmd 包装）及对应的搜索关键词手动引号包裹
- **打包**：[package.json](../../../album-shelf/package.json) 新增依赖、asarUnpack 与文件排除规则、extraResources 辅助脚本、`ncm-cli` npm script
- **新增文件**：[ncm-configure.bat](../../../album-shelf/build/ncm-configure.bat)
- **文档**：[README.md](../../../README.md)、[INSTALL.md](../../../album-shelf/INSTALL.md)
- **凭证与登录状态**：继续存于用户主目录 `~/.config/ncm-cli/`，不受影响
- **发版管线**：无改动（CI 已有 `--replace-registry-host=always` 处理 lockfile 内网镜像地址）
