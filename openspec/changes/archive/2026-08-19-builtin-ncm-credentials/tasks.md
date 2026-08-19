# Tasks：内置网易云 API 凭证（写死、用户不可修改）

## 1. 主进程内置凭证模块

- [x] 新增 `album-shelf/src/main/ncm-credentials.ts`：`BUILTIN_NCM_APP_ID` / `BUILTIN_NCM_PRIVATE_KEY` 常量（私钥单行字符串字面量，不拆行拼接）+ `ensureBuiltinCredentials(service)`
- [x] `ensureBuiltinCredentials` 逻辑：读回状态 → 已配置且 appId 与内置值一致则跳过；否则 `configureWithCredentials(内置值)`；失败抛给调用方记日志

## 2. 启动时自动写入

- [x] `ipc-handlers.ts` 的 `registerIpcHandlers()` 中 `initServices()` 之后 fire-and-forget 调用 `ensureBuiltinCredentials(ncmCliService)`，`.catch` 仅 `console.error`，不阻断启动
- [x] 移除 `ncm:configureCredentials` IPC handler

## 3. IPC 与 preload 收敛

- [x] `preload/index.ts` 移除 `ncmConfigureCredentials`；保留 `ncmGetCredentialStatus`
- [x] `preload/index.d.ts` 同步移除对应类型声明

## 4. 渲染层 SettingsModal

- [x] 移除凭证输入表单（appId 文本框、privateKey 密码框、保存按钮、错误/成功提示）与 `credentialForm` / `savingCredentials` / `credentialMessage` / `handleSaveCredentials` 逻辑
- [x] 保留只读状态行与 `refreshCredentialStatus`；描述文案改为凭证已内置、自动写入
- [x] 清理不再使用的 CSS（`.field-label`、`.credential-input*`、`.credential-save-btn*`、`.credential-message*`）

## 5. Spec 更新与归档

- [x] 变更目录 `specs/ncm-cli-adapter/spec.md` 将「应用内设置网易云 API 凭证」Requirement 修改为「内置网易云 API 凭证自动配置」
- [x] 实现完成后合并进 `openspec/specs/ncm-cli-adapter/spec.md`，change 归档到 `openspec/changes/archive/`

## 6. 文档同步

- [x] README.md：删除「申请并配置 API 凭证」步骤，首次使用只需扫码登录；同步凭证内置说明
- [x] album-shelf/INSTALL.md：同步上述变更

## 7. 验证清单（用户手动执行）

- [ ] `npm run dev`：首次启动（删除 `~/.config/ncm-cli/credentials.enc.json` 模拟）后同步、搜索、热评正常；设置界面无凭证输入入口，状态行显示已配置
- [ ] 手动把 `config get appId` 改成其他值后重启应用：启动后自动恢复为内置值
- [ ] 日志中不出现私钥全文（仅掩码）
- [ ] `npm run pack` 打包版：干净机器上开箱即用，无需配置凭证
