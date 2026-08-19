## 背景

既有的凭证写入链路（`NcmCliService.configureWithCredentials` + `getCredentialConfigStatus`）已经过实测验证：非交互、私钥经临时文件传递不进 argv、读回校验、未登录可配置、登录态不受影响。本 change 不需要改造这条链路，只改变**谁在何时以什么值调用它**，以及**界面是否暴露输入入口**。

## 方案总览

```
应用启动 (registerIpcHandlers)
  └─ ensureBuiltinCredentials(ncmCliService)   [fire-and-forget]
       ├─ getCredentialConfigStatus()          读回 ~/.config/ncm-cli 中的 appId
       ├─ 已配置且 appId == 内置值 → 跳过（幂等）
       └─ 未配置 / 不一致 / 无法解析 → configureWithCredentials(内置值)
            （失败仅记日志，不阻断启动）
```

设置界面：移除输入表单，保留只读状态行（复用 `ncm:getCredentialStatus` IPC），描述文案改为「凭证已内置」。

## 关键设计决策

### 1. 启动时自动写入，而非打包预置凭证文件

ncm-cli 的 `credentials.enc.json` 是**加密存储**（enc 后缀），其加密方案是 ncm-cli 内部实现，直接向 `~/.config/ncm-cli/` 预置文件需要复刻加密逻辑，属于脆弱耦合。而 `config set` 命令是官方支持的非交互写入入口且已在上一轮 change 中实测。因此选择启动时调用 `config set`，写入位置与既有行为完全一致。

### 2. 幂等：一致才跳过，否则重写

- `config get appId` 读回的 appId 与内置值一致 → 已就绪，跳过（避免每次启动都起 3~4 个子进程）
- 未配置、appId 不同（旧版本用户自配过）、或"含凭证文件标记但解析不出值"（appId 为 null）→ 重写。重写覆盖用户历史配置，符合「写死、不允许用户修改」的需求
- 启动写入失败（CLI 损坏、磁盘异常等）仅 `console.error`，不阻断启动——数据功能调用时 ncm-cli 会自然报"凭证未配置"错误，用户可在设置界面状态行看到"未配置"

### 3. 常量放置与私钥形态

新增独立模块 `src/main/ncm-credentials.ts` 存放 `BUILTIN_NCM_APP_ID` / `BUILTIN_NCM_PRIVATE_KEY`。私钥按单行字符串字面量存放——与既有写入路径一致（临时文件**不含换行**，`config set privateKey <文件路径>` 按原样读取），不拆分拼接，避免改变密钥字节。

既有日志纪律天然生效：`configureWithCredentials` 只打掩码私钥（`MIIEvAIB***`），内置私钥全文不会出现在任何日志中。

### 4. 设置界面：删表单、留状态

移除 appId 文本框、privateKey 密码框、保存按钮及全部表单逻辑（`credentialForm`、`handleSaveCredentials`、`savingCredentials`、`credentialMessage`）与相应 CSS。保留：

- 状态行：`未配置 / 已配置（掩码 appId）`——自动写入失败时用户能看到未配置，而非静默
- `ncm:getCredentialStatus` IPC 与 `NcmCliService.getCredentialConfigStatus()` 原样保留

移除 `ncm:configureCredentials` IPC handler 与 preload 的 `ncmConfigureCredentials`（无其他调用方），避免留下不可达的配置入口。

### 5. 启动时机

`registerIpcHandlers()` 内 `initServices()` 之后 fire-and-forget 调用。理由：`ncmCliService` 实例在此创建；不 await 避免阻塞窗口创建（每次 ncm-cli 子进程启动约 1s，最坏 4 次调用）；凭证写入与登录状态无关，无顺序依赖。

### 6. ncm-configure.bat 的处理

保留但不再作为文档中的推荐配置路径。启动自动写入会覆盖向导的配置结果，向导仅剩排查用途（如验证 CLI 是否可用）。删除 bat/exe 涉及 extraResources 打包配置，超出本 change 范围（见 proposal Non-goals）。

## 风险

| 风险 | 缓解 |
| --- | --- |
| 内置私钥可被从 asar 提取 | 用户明确要求写死；该凭证非个人机密，见 proposal「已知取舍」 |
| 启动写入与用户首次数据操作竞态 | 数据命令在凭证就绪前会报"未配置"，用户重试即可；写入通常在窗口显示前完成 |
| 旧用户自配凭证被覆盖 | 符合「不允许用户修改」的需求语义 |
