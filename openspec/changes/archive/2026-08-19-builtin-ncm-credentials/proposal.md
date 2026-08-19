## Why

上一轮 change（2026-08-19-in-app-ncm-configure）把网易云开放平台 API 凭证（appId + privateKey）做成了设置界面内的可编辑表单。但该应用面向固定使用者，凭证不需要逐用户配置——要求用户自行去开放平台申请 API Key 门槛过高，且用户自备凭证的配置流程（申请、复制、粘贴长私钥）易错。

本 change 将一套固定凭证（appId + privateKey）内置进应用：应用启动时自动写入 ncm-cli 本地配置，设置界面不再提供任何凭证输入入口，用户开箱即用、扫码登录即可。

## What Changes

- **主进程**：新增 `ncm-credentials.ts` 模块，内置 appId / privateKey 常量与 `ensureBuiltinCredentials()`——启动时读回配置状态，未配置或 appId 与内置值不一致时以非交互方式重写凭证（复用既有 `configureWithCredentials`，幂等、失败不阻断启动）
- **设置界面**：移除「网易云凭证」区的输入表单与保存按钮，仅保留只读状态行（展示内置凭证的写入状态，用于诊断自动写入失败）
- **IPC**：移除 `ncm:configureCredentials`（preload 同步移除）；保留 `ncm:getCredentialStatus` 供状态行使用
- **文档**：README.md 与 album-shelf/INSTALL.md 删除「申请并配置 API Key」步骤，首次使用只需扫码登录

## Capabilities

### Modified Capabilities

- `ncm-cli-adapter`：「应用内设置网易云 API 凭证」Requirement 改为「内置网易云 API 凭证自动配置」

## Non-goals

- 不改造 ncm-cli 本身（`config set`/`config get` 命令行为不变）
- 不删除 `ncm-configure.bat` / `ncm-configure.exe`（保留为遗留备用入口，启动时自动写入会覆盖其配置结果）
- 不改变凭证存储位置（仍是用户主目录 `~/.config/ncm-cli/credentials.enc.json`）
- 不做凭证在线校验（ncm-cli 读取时的格式门控行为保持不变）

## Impact

- **主进程**：[ncm-credentials.ts](../../../album-shelf/src/main/ncm-credentials.ts) 新增；[ipc-handlers.ts](../../../album-shelf/src/main/ipc-handlers.ts) 启动时触发自动写入、移除配置 IPC；[ncm-cli-service.ts](../../../album-shelf/src/main/ncm-cli-service.ts) 零改动
- **IPC/预加载**：[preload/index.ts](../../../album-shelf/src/preload/index.ts)、[index.d.ts](../../../album-shelf/src/preload/index.d.ts) 移除 `ncmConfigureCredentials`
- **渲染层**：[SettingsModal.vue](../../../album-shelf/src/renderer/src/SettingsModal.vue) 移除凭证输入表单
- **文档**：[README.md](../../../README.md)、[INSTALL.md](../../../album-shelf/INSTALL.md)
- **已知取舍**：凭证以明文形式存在于应用包内（asar 中可被提取），与「用户不可修改」的需求直接相关——该凭证仅用于 API 限流下的数据查询，属于用户明确要求的固定配置，而非严格机密的个人凭据
