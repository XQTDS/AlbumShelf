## Why

上一轮 change（2026-08-18-bundle-ncm-cli）已将 @music163/ncm-cli 0.1.6 内置进安装包，但网易云开放平台 API 凭证（appId + privateKey）配置仍依赖双击 `resources/ncm-configure.bat` 运行交互式向导——需要真实 TTY（bat 配套的 C# 启动器通过 AttachConsole/AllocConsole 解决），且存在控制台编码相关的心智负担。对普通用户而言，更自然的位置是应用内的设置界面。

本 change 将凭证配置做成设置界面内的表单：appId 文本框 + privateKey 密码框，保存时主进程以**非交互方式**调用内置 ncm-cli 完成配置，全程无 TTY、不弹终端窗口、私钥不落应用存储、不回显、不进日志。bat/exe 保留作为备用入口。

## What Changes

- **主进程**：`NcmCliService` 新增 `configureWithCredentials(appId, privateKey)` 与 `getCredentialConfigStatus()`，基于既有的 `execNcmCli` 执行层（零改动）调用 ncm-cli 官方非交互式配置命令 `config set` 与读回命令 `config get`
- **私钥传输**：privateKey 通过 `config set privateKey <文件路径>` 的文件输入方式传递（官方支持），私钥写入 os.tmpdir() 下的随机名临时文件，调用后立即删除——私钥不进入子进程 argv
- **IPC**：新增 `ncm:getCredentialStatus` / `ncm:configureCredentials`，沿用现有 registerIpcHandlers + contextBridge 模式
- **设置界面**：SettingsModal 增加「网易云凭证」配置区（状态展示、appId/privateKey 输入、保存、错误提示），复用现有「设置 → 匹配策略...」菜单入口
- **文档**：README.md 与 album-shelf/INSTALL.md 将应用内设置作为首选配置方式，bat 降级为备用说明

## Capabilities

### Modified Capabilities

- `ncm-cli-adapter`：新增"应用内设置 API 凭证"场景（非交互式 `config set` 配置、凭证状态读回）

## Non-goals

- 不改造 ncm-cli 本身（其 `configure` 向导与 `config` 命令行为均不变）
- 不新增登录/扫码入口（已有应用内入口，设置界面仅展示登录状态之外的凭证配置状态）
- 不删除/修改 `ncm-configure.bat` 与 `ncm-configure.exe`（保留为备用入口）
- 不引入凭证格式校验（ncm-cli 读取时的格式门控行为保持不变）
- 不改 release.yml、不改 npm registry

## Impact

- **主进程**：[ncm-cli-service.ts](../../../album-shelf/src/main/ncm-cli-service.ts) 新增两个方法（execNcmCli 及其怪癖兼容逻辑零改动）
- **IPC/预加载**：[ipc-handlers.ts](../../../album-shelf/src/main/ipc-handlers.ts)、[preload/index.ts](../../../album-shelf/src/preload/index.ts)、[index.d.ts](../../../album-shelf/src/preload/index.d.ts)
- **渲染层**：[SettingsModal.vue](../../../album-shelf/src/renderer/src/SettingsModal.vue) 增加凭证配置区
- **文档**：[README.md](../../../README.md)、[INSTALL.md](../../../album-shelf/INSTALL.md)
- **凭证存储**：继续位于用户主目录 `~/.config/ncm-cli/credentials.enc.json`（ncm-cli 加密存储），与安装位置无关；登录状态（tokens.enc.json）不受配置操作影响
