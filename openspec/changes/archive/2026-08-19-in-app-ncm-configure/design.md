# 设计：网易云凭证配置内置到应用设置界面

## 1. 实测第一项：configure 官方非交互式路径不存在（0.1.6）

任务前提假设 `ncm-cli configure` 支持 `--app-id`/`--private-key-file` 参数或 `NETEASE_APP_ID`/`NETEASE_PRIVATE_KEY` 环境变量的非交互式配置。**实测证伪**（Electron 36.9.5 内置 Node，ncm-cli 0.1.6，stdin=/dev/null 无 TTY）：

| 验证项 | 结果 |
|---|---|
| `configure` 无 TTY + 环境变量 | ❌ 仍报"configure 命令需要交互式终端（TTY）"，exit 1 |
| `configure --app-id=... --private-key-file=...` | ❌ `error: unknown option '--app-id=...'`（`configure --help` 显示该命令未注册任何 option） |
| 伪造 `process.stdin/stdout/stderr.isTTY=true` | 向导（@clack/prompts）可启动，管道可驱动回答问题 |
| 管道驱动向导跑完 | exit 0，但**凭证未写入任何文件**，且向导会启动播放器 daemon（用真实 home 跑完用户队列后自退）——脆弱且有副作用 |

**结论**：报错文案中"如需非交互式配置，请使用命令行参数或环境变量"有误导性——`NETEASE_APP_ID`/`NETEASE_PRIVATE_KEY` 环境变量只在数据命令**读取凭证**时生效（bundle 内 `getApiCredentials` 对 env 的短路逻辑，实测确认存在），并不能用于**写入**配置。驱动 @clack 向导方案依赖伪造 TTY 与问题序列，脆弱且会拉起播放器 daemon，放弃。

## 2. 官方非交互式配置命令：`config set`（实测发现）

无凭证环境下运行任何命令时，ncm-cli 报错文案暴露了官方非交互式入口：

```
[错误] API key 未设置，请通过以下方式之一配置：
  - 运行 ncm-cli configure 进行交互式配置
  - 运行 ncm-cli config set appId <你的AppId>
  - 运行 ncm-cli config set privateKey <你的privateKey>
```

实测行为（隔离 `USERPROFILE` 临时 home，避免污染真实凭证；全部无 TTY）：

| 验证项 | 结果 |
|---|---|
| `config set appId <id>` | ✅ exit 0，stdout `✓ 已设置 appId = <id>` |
| `config set privateKey <key>` | ✅ exit 0，stdout `✓ 已设置 privateKey = <前8字符>***`（CLI 自身掩码） |
| `config set privateKey <文件路径>` | ✅ 文件**存在**时读取文件内容写入；文件**不存在**时把路径字符串本身当密钥写入（exit 0，静默陷阱，应用必须自行校验文件存在） |
| 文件内容换行处理 | 实测**不裁剪换行**（带/不带换行两次写入的 credentials.enc.json 不同）→ 应用写临时文件不带换行 |
| 写盘位置 | 仅写 `~/.config/ncm-cli/credentials.enc.json`（`{iv, data}` AES 加密）；config.json、tokens.enc.json（登录态）不动 |
| 未登录状态下配置 | ✅ 隔离 home 无任何登录态，config set 正常（配置先于登录成立） |
| 空值校验 | ❌ `config set appId ""` exit 0 照存 → 应用自行校验非空 |
| 未知 key | stderr `无效的配置项: xxx\n可用配置项: appId, privateKey, player`，exit 1 |
| `--output json` | 对 config 命令无效但被接受，输出仍是纯文本，exit 0 |
| 副作用 | config set 不启动 daemon、不写 app.log、不动真实 home 其他文件 |
| 读回 `config get appId` | ✅ stdout `appId: <值> (凭证文件)`；未配置 → `appId: (未配置)`；仅设 privateKey 时 appId 亦为 `(未配置)` |
| `config list` | appId 全量、privateKey 掩码（`***`）、player；全部未配置时输出"尚未配置。运行 ncm-cli configure..." |
| 凭证生效门控 | 真实格式（32 位 hex）凭证写入后 `--help` 门控通过；伪格式（如 `json-test`）写入成功但门控仍报"API key 未设置"（读取时有格式校验） |
| 登录对数据命令的影响 | 未登录时 `search album` 仍报 `unknown command`（manifest 门控，既有行为） |

**结论**：应用采用 `config set` 完成配置——appId 直接以 argv 传入（非机密）；privateKey 走**文件路径输入**（密钥不进 argv），临时文件写入后立即删除。

## 3. 主进程实现：NcmCliService 新方法

复用既有 `execNcmCli(args)` 执行层（`ELECTRON_RUN_AS_NODE=1` + `process.execPath` + 打包路径重写，全部零改动）。config 命令返回纯文本而非 JSON，**不追加 `--output json`**，直接解析 stdout/stderr 与退出码：

```ts
async configureWithCredentials(appId: string, privateKey: string): Promise<void> {
  // 1. 校验非空（CLI 不校验空值）
  // 2. execNcmCli(['config', 'set', 'appId', appId]) → exit 0 且 stdout 含 "已设置"
  // 3. 临时文件：join(os.tmpdir(), `ncm-key-${crypto.randomBytes(6).toString('hex')}.tmp`)
  //    writeFileSync(path, privateKey, 'utf8')（无换行）
  //    existsSync 校验（规避"路径当字面值"陷阱）
  // 4. execNcmCli(['config', 'set', 'privateKey', tempPath]) → 校验成功
  // 5. finally: rmSync(tempPath, { force: true })
  // 6. 读回校验：config get appId → 解析值与写入 appId 一致，否则报错
}
```

- 失败判定：execFileAsync 对非零退出码 reject，error 对象携带 stdout/stderr → 提取中文 message（stderr 优先，如"无效的配置项"）透传给 UI
- **日志纪律**：console.log 只打印 appId 与掩码私钥（`前8字符***`），绝不打印 privateKey 全文与临时文件内容；临时文件路径可打印
- 私钥在临时文件中的存活窗口 = 一次子进程调用周期（15s 超时内），文件位于用户级 os.tmpdir()

```ts
async getCredentialConfigStatus(): Promise<{ configured: boolean; appId: string | null }> {
  // execNcmCli(['config', 'get', 'appId'])
  // stdout 形如 "appId: <值> (凭证文件)" → { configured: true, appId: <值> }
  // "appId: (未配置)" → { configured: false, appId: null }
  // 格式不合预期（兜底）：stdout 含 "(凭证文件)" → { configured: true, appId: null }
  // 执行失败（CLI 不可用等）→ { configured: false, appId: null }（不抛错，UI 仅展示状态）
}
```

appId 非机密（开放平台控制台公开标识），可全量读回；UI 展示时按任务要求掩码（前 8 字符 + `…`）。privateKey 永不读回（CLI 本身也只掩码回显）。

## 4. IPC 与渲染层

- 主进程 `ipc-handlers.ts`：`ncm:getCredentialStatus` / `ncm:configureCredentials`，返回 `{ success, data?, error? }`（沿用 settings/mb 模式）
- preload：`ncmGetCredentialStatus()` / `ncmConfigureCredentials({ appId, privateKey })`，同步更新 index.d.ts
- SettingsModal.vue：标题改为「设置」，body 分「匹配策略」与「网易云凭证」两区：
  - 状态行：未配置 / 已配置（掩码 appId，读不到就只显示"已配置"）
  - appId 文本框 + privateKey `type="password"` 密码框（掩码输入、不回显、不写日志、不落应用存储）
  - 保存按钮（带 loading 态）独立于策略保存；成功/错误提示展示 ncm-cli 中文 message
  - 打开弹窗时刷新凭证状态；凭据输入仅存内存，关闭弹窗即清空

## 5. 已知风险与说明

- **argv 可见性**：appId 进入子进程 argv（非机密，可接受）；privateKey 经临时文件传入，不进 argv。临时文件在调用完成后立即删除（finally），失败路径同样清理
- **"路径当字面值"陷阱**：临时文件缺失时 CLI 会把路径当密钥静默写入——应用在调用前 existsSync 校验，杜绝该分支
- **凭证格式门控**：CLI 读取时有格式校验（伪格式写入成功但门控仍失败），应用不做格式校验，用户保存"成功"后若数据功能仍报"API key 未设置"即提示凭证值有误——错误信息透传，不额外解释
- **Electron-as-node 每命令一次进程启动**（约数百 ms）：保存 = 3 次调用（set appId / set privateKey / get appId 校验），15s 超时内可接受
- **bat 向导回归**：config set 只写 credentials.enc.json，不影响向导逻辑；bat/exe 保留不动
