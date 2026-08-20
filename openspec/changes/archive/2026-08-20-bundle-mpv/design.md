# 设计：Windows 安装包内置 mpv

## 1. 二进制来源与版本固定

- **来源**：[zhongfly/mpv-winbuild](https://github.com/zhongfly/mpv-winbuild) GitHub Release（shinchiro 构建线的维护 fork；原 `shinchiro/mpv-winbuild` 仓库已不可用，实测 404。winget 的 `shinchiro.mpv` 包亦指向该构建线产物）。
- **选型**：普通 `x86_64` 构建（非 `x86_64-v3`——v3 要求 AVX2，2015 年前的老 CPU 无法运行）；GPL 完整构建（含 ffmpeg 静态链接，单文件可运行）。
- **固定方式**：`build/mpv-manifest.json` 记录 release tag、asset 名与 SHA256（与同 release 发布的 `sha256.txt` 一致）。升级 mpv = 改 manifest + 重跑 `npm run fetch-mpv`，仓库内无二进制。
- **当前固定版本**：tag `2026-08-19-e7191f2a65`，asset `mpv-x86_64-20260819-git-e7191f2a65.7z`（31.1MB 压缩包），SHA256 `f3d2eddc19588b56ac0a9d4c829a446aa1b07d6ddcadd77cba73c9a07453366a`。

## 2. 拉取脚本 scripts/fetch-mpv.mjs

- 纯 Node 实现（≥18，内置 fetch），零运行时依赖。
- 流程：读 manifest → 下载 7z 到系统临时目录 → SHA256 校验（失败即退出 1）→ 解压（devDependency `7zip-bin` 提供的 `7za.exe`，**不依赖系统安装 7-Zip**，CI 与开发机均可跑）→ 将 `mpv.exe`、`mpv.com`、`mpv/fonts.conf` 拷贝到 `build/mpv/`（任务 1 实测归档内容，无 dll）→ 另从 mpv-player/mpv 仓库按 manifest 固定的 commit 下载 `LICENSE.GPL` 存为 `build/mpv/LICENSE.txt`（失败仅告警不中止，归档内无 LICENSE 文件）→ 幂等：目标目录已存在且 `mpv.exe` 大小与 manifest 一致则直接跳过。
- 非 win32 平台直接退出 0（mac 不捆绑）。
- `package.json` scripts 增加：`"fetch-mpv": "node scripts/fetch-mpv.mjs"`。

## 3. 打包

- electron-builder `win.extraResources` 增加 `{ "from": "build/mpv", "to": "mpv" }`——仅加在 `win` 配置块内，mac 构建不受影响。打包后位于 `resources/mpv/mpv.exe`。
- `build/mpv/` 加入 `.gitignore`（解压后 mpv.exe ~115MB，不入库）。
- 体积估算：mpv.exe ~114MB + mpv.com/fonts.conf/LICENSE.txt 极小，NSIS LZMA 压缩后安装包预计增大 40~50MB。
- 合规：GPL 仅捆绑分发、不修改不链接；LICENSE 从 mpv-player/mpv 仓库按 manifest 固定 commit 下载为 `build/mpv/LICENSE.txt`（归档内实测无 LICENSE 文件）。

## 4. 运行时 PATH 注入

- **唯一改动点**：[ncm-cli-service.ts](../../../album-shelf/src/main/ncm-cli-service.ts) 的 `execNcmCli`（所有 ncm-cli 子进程 spawn 的收敛点）。
- 新增 `resolveBundledMpvDir()`：打包模式 `join(process.resourcesPath, 'mpv')`；开发模式 `join(app.getAppPath(), 'build', 'mpv')`。
- 注入条件：win32 平台且 `existsSync(mpvDir + mpv.exe)` 为真 → `env.PATH = mpvDir + path.delimiter + process.env.PATH`（与既有 `ELECTRON_RUN_AS_NODE: '1'` 合并）。
- **生效链**（本会话实测验证）：CLI 子进程 env → DaemonClient 启动的 PlayerDaemon 继承 env → daemon 按 env PATH spawn mpv。注入 PATH 即可全链路生效。
- **优先级**：捆绑 mpv 优先于用户自装 mpv（PATH 前置）。捆绑缺失时行为与现状完全一致（回落用户 PATH），开发环境不拉取也能用本机 mpv 播放。

## 5. CI 集成

- `release.yml` build job：Windows runner 在 `npm run dist` 之前执行 `npm run fetch-mpv`；macOS job 不执行（脚本按平台自跳，无需条件语法）。
- 下载走 GitHub 直连（与 npm registry 镜像约束无关，CI 云环境可达）。
- fetch 失败（网络异常 / 校验不通过）→ 脚本非零退出 → **Windows 构建失败**，不产出无 mpv 的安装包；mac 构建不受影响（`fail-fast: false` 保持两平台独立）。

## 6. 已知风险与说明

- **快照式固定**：zhongfly 的 release 按日期滚动，GitHub release 常驻不删，manifest 固定的 URL 长期有效；缺点是 mpv 安全更新需手动跟进 manifest（后续可做 dependabot 或版本提醒）。
- **7z 归档内容清单**已在任务 1 实测确认：mpv.exe、mpv.com、mpv/fonts.conf、doc/、installer/，**无 dll、无 LICENSE**（提取与合规流程按实测结果编写）。
- 捆绑 mpv 与用户自装 mpv 并存时捆绑版生效——版本固定、行为一致，是预期选择；用户自装版本不影响任何数据命令。
- 捆绑 mpv 优先级高于 PATH 中任何同名可执行文件，若用户 PATH 中第一个 mpv 是恶意/异常文件，捆绑版反而规避了它（安全上是改进）。
