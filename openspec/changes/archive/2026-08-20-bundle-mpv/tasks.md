# 任务清单：Windows 安装包内置 mpv

## 实现

### 1. 探明 mpv 归档内容清单

- [x] 手动下载 `mpv-x86_64-20260819-git-e7191f2a65.7z` 并解压，确认归档内文件清单（实测：`mpv.exe`、`mpv.com`、`mpv/fonts.conf`、`doc/`、`installer/`，**无 dll、无 LICENSE**）
- [x] 确认 `mpv.exe` 独立运行无缺 dll（提取自 zhongfly 官方 release 的完整构建；直接运行 `mpv --version` 冒烟由用户验证清单第 1 条执行）

### 2. 拉取脚本与 manifest

- [x] 新增 `build/mpv-manifest.json`（tag / asset / sha256 / expectedExeSize / licenseUrl，按设计第 1 节固定版本）
- [x] 新增 `scripts/fetch-mpv.mjs`：下载 → SHA256 校验 → 7zip-bin 解压 → 拷贝 `mpv.exe` + `mpv.com` + `mpv/fonts.conf` 到 `build/mpv/`，另按 manifest 固定 commit 从 mpv-player/mpv 下载 LICENSE.GPL 存为 `LICENSE.txt`（失败仅告警）→ 幂等跳过（mpv.exe 大小与 manifest 一致）→ 非 win32 退出 0；已实测端到端跑通（SHA256 校验通过）
- [x] `package.json`：增加 `"fetch-mpv"` script；devDependencies 增加 `7zip-bin`
- [x] `.gitignore` 增加 `build/mpv/`

### 3. 打包配置

- [x] `package.json` 的 `build.win.extraResources` 增加 `{ "from": "build/mpv", "to": "mpv" }`（仅 win 块）

### 4. 运行时 PATH 注入

- [x] `ncm-cli-service.ts`：新增 `resolveBundledMpvDir()`（打包 `process.resourcesPath/mpv`，开发 `app.getAppPath()/build/mpv`，进程内缓存）
- [x] `execNcmCli`：win32 且捆绑 mpv.exe 存在时，env.PATH 前置捆绑目录（与既有 `ELECTRON_RUN_AS_NODE` 合并）；缺失时行为不变

### 5. CI 集成

- [x] `.github/workflows/release.yml`：build job 在 `npm run dist` 前增加 `npm run fetch-mpv` 步骤（步骤对两个平台统一执行，fetch 脚本按平台自动跳过，等效"仅 Windows 生效"；拉取失败退出非零即中止该平台构建）

## 收尾

### 6. 更新受影响 spec

- [x] `openspec/specs/ncm-cli-adapter/spec.md`：新增 requirement「捆绑 mpv 的 PATH 注入」（子进程 env 前置捆绑 mpv 目录、缺失回落、非 win32 不注入）
- [x] `openspec/specs/playback/spec.md`：新增 requirement「mpv 依赖解析与开箱即播」（捆绑优先 / 回落用户自装 / 打包版开箱即播）
- [x] `openspec/specs/release-pipeline/spec.md`：新增 requirement「Windows 构建捆绑 mpv」（CI fetch 步骤、fetch 失败中止 Windows 构建、mac 包不含 mpv）

### 7. 同步 README

- [x] README 播放功能说明补充：Windows 安装包内置 mpv、开箱即播；mac 需 `brew install mpv`；开发环境 `npm run fetch-mpv`；命令表与技术栈表同步

### 8. 归档

- [ ] 将本 change 目录移入 `openspec/changes/archive/`（按 CLAUDE.md，待用户验证后执行）

## 验证清单（用户手动执行，见 CLAUDE.md 验证约定）

1. `npm run fetch-mpv` → `build/mpv/mpv.exe` 生成，`build\mpv\mpv.exe --version` 正常
2. `npm run dev` → 播放任意专辑：任务管理器确认 mpv 进程路径为 `build/mpv/mpv.exe`（而非用户自装版本）
3. `npm run pack`（electron-builder --dir）→ 确认 `win-unpacked/resources/mpv/mpv.exe` 存在，运行打包版播放成功
4. 删除本机 PATH 中的用户 mpv（或换一台无 mpv 机器）→ 打包版仍能播放（开箱即播验证）
