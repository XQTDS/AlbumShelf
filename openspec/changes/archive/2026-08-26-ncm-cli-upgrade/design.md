# 设计：ncm-cli 0.1.7 升级与 token 自动刷新

## 1. 0.1.7 行为依据

- changelog（tarball 内 README「版本历史」）：`0.1.7` 唯一条目为 **token 过期后自动刷新恢复，`login --check` 支持主动续期**；0.1.6 条目为播客能力，无任何登录相关变更
- 依赖声明：0.1.7 与 0.1.6 的 package.json 除 `version` 字段外完全相同（dependencies / main / bin / engines 逐字一致）→ 升级是纯替换，不引入新依赖树

## 2. 兼容性实测（2026-08-26，本机）

| 验证项 | 结果 |
|--------|------|
| `login --check --output json` | 两版输出一致：`{"success":true,"message":"已登录实名账号"}`，项目 `getLoginStatus()` 解析逻辑零改动 |
| `login --help` | `--check` / `--background` / `--output` 选项与 0.1.6 一致，二维码登录流程（`login --background`）不受影响 |
| 入口解析 | `require.resolve('@music163/ncm-cli')` → `dist/index.js`，`resolveNcmCliEntry` 的 asar.unpacked 重写路径不受版本影响 |
| token 存储 | `~/.config/ncm-cli/tokens.enc.json` 加密存储模型（namedToken / namedRefreshToken / namedTokenExpireAt）两版代码均具备 → 升级后现有登录态直接可用，实测升级后 `login --check` 返回已登录，无需重新扫码 |
| 运行时 | engines `>=18.0.0`；应用以 Electron 36 内置 Node（v22）执行，满足要求 |

## 3. 升级方案

1. `album-shelf/package.json`：`"@music163/ncm-cli": "0.1.6"` → `"0.1.7"`
2. `npm install`（本地 registry 为网易镜像，lockfile 保持 `npm.nie.netease.com` 源，CI 重写约定不受影响）；postinstall electron-rebuild 正常完成
3. `INSTALL.md`：全局 CLI 版本一致性说明（"当前为 0.1.6" → "0.1.7"）

## 4. 生效机制（与现有架构的配合）

- **启动主动续期**：`initAuthOnStartup → checkAndUpdateLoginStatus → ncm-cli login --check`。0.1.7 的 `--check` 在 token 过期但 refreshToken 有效时主动续期并返回已登录——现有代码无需任何改动即获得续期能力
- **运行中自动恢复**：同步、搜索、热评等数据命令遇 token 过期时，0.1.7 内部自动刷新恢复后正常返回，应用侧 `NcmLoginRequiredError` 只在 refreshToken 也失效时才触发（弹登录窗引导扫码，行为不变）

## 5. 边界与已知取舍

- refreshToken 本身有网易侧有效期：长期（超出该有效期）不使用应用仍需扫码登录。0.1.7 解决"频繁过期"，不是"永久免登"
- 实测当日凭证返回 `-461 请求总量超限`（配额用尽）：与登录过期无关，0.1.6/0.1.7 行为一致，不属本次范围
- 代码中沉淀的 0.1.6 行为怪癖注释（`album collected` recordCount 恒为 0、limit 过小 400 等）保留为历史探测记录；0.1.7 未改动这些命令，待配额恢复后实测确认再决定是否更新标注

## 6. 用户侧验证点

- `npm run dev` 启动后登录态正常、不弹登录引导
- 收藏同步、在线搜索、热评可用（当天若报「请求总量超限」为配额问题，与本次升级无关）
- 播放（mpv）正常
