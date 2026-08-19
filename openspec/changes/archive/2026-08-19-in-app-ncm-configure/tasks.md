# Tasks：网易云凭证配置内置到应用设置界面

## 1. 实测调研（design 阶段先行）

- [x] 实测 `configure` 非交互路径：无 TTY + 环境变量 / `--app-id` 参数均不可用（0.1.6 向导强制 TTY，报错文案误导）；伪造 TTY + 管道驱动向导可行但凭证不落盘且拉起播放器 daemon，方案放弃
- [x] 实测发现官方非交互入口 `config set appId/privateKey`：无 TTY 可用、退出码与输出格式、写盘位置（仅 credentials.enc.json）、未登录可配置、登录态不受影响、`config get appId` 读回、空值不校验、"文件不存在时路径被当密钥"陷阱、换行不裁剪
- [x] 实测结果记入 design.md

## 2. 主进程 NcmCliService

- [x] 新增 `configureWithCredentials(appId, privateKey)`：参数非空校验；`config set appId`（argv 传值）；privateKey 经 os.tmpdir() 随机名临时文件（无换行、existsSync 前置校验）走文件路径输入；finally 删除临时文件；读回 `config get appId` 校验写入值与预期一致
- [x] 新增 `getCredentialConfigStatus()`：解析 `appId: <值> (凭证文件)` / `appId: (未配置)`；格式异常兜底为"已配置"；执行失败降级为"未配置"不抛错
- [x] 既有 execNcmCli 与全部怪癖兼容逻辑零改动；不追加 `--output json`；错误 message（stderr/error 对象）透传
- [x] 日志纪律：私钥全文与临时文件内容绝不入日志（仅掩码）

## 3. IPC 与 preload

- [x] ipc-handlers.ts 注册 `ncm:getCredentialStatus` / `ncm:configureCredentials`（沿用 `{ success, data?, error? }` 模式）
- [x] preload/index.ts 暴露 `ncmGetCredentialStatus` / `ncmConfigureCredentials`；index.d.ts 同步类型

## 4. 渲染层 SettingsModal

- [x] 标题改为「设置」；新增「网易云凭证」区：状态行（未配置 / 已配置 + 掩码 appId，读不到只显示状态）、appId 文本框、privateKey 密码框、保存按钮（loading 态）、成功/错误提示（透传中文 message）
- [x] 打开弹窗时刷新凭证状态；输入仅存内存，关闭清空；privateKey 不回显不落盘

## 5. Spec 更新与归档

- [x] 变更目录 `specs/ncm-cli-adapter/spec.md` 新增"应用内设置 API 凭证"Requirement
- [x] 实现完成后合并进 `openspec/specs/ncm-cli-adapter/spec.md`，change 归档到 `openspec/changes/archive/`

## 6. 文档同步

- [x] README.md：凭证配置首选方式改为「菜单栏 → 设置」，bat 降级为备用说明
- [x] album-shelf/INSTALL.md：同步上述变更

## 7. 验证清单（用户手动执行）

- [ ] `npm run dev`：设置弹窗填写凭证 → 保存成功 → 同步专辑列表、搜索、热评正常；错误凭证时提示清晰；重启应用配置仍在；私钥不出现在日志与界面回显中
- [ ] `npm run pack` 打包版：同样流程可用；登录状态与 `~/.config/ncm-cli/` 凭证不丢失
- [ ] 原 ncm-configure.bat 备用路径回归验证一次仍可用
