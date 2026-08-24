## Requirements

### Requirement: v* 标签触发多平台构建与发布

系统 SHALL 在推送 `v*` 标签时通过 GitHub Actions 矩阵并行构建两个平台的安装包——Windows x64（NSIS 安装包）与 macOS arm64（dmg + zip）——并在全部构建完成后创建单个 GitHub Release（自动生成 release notes），上传全部安装包。

#### Scenario: 标签触发全量发布

- **WHEN** 推送 `v*` 标签到远端
- **THEN** 系统 SHALL 在 `windows-latest` 与 `macos-15` 两个 runner 上并行执行 `npm run dist`，各自将产物上传为 workflow artifact
- **AND** 构建全部成功后，release job SHALL 下载全部 artifact、剔除辅助文件（.blockmap / .yml 等）后创建 GitHub Release，资产包含 Windows 的 `.exe` 与 macOS 的 `.dmg`/`.zip`

#### Scenario: 单平台构建失败

- **WHEN** 某一平台构建失败
- **THEN** 系统 SHALL NOT 创建 Release（修复后重新推送标签），其余平台的构建验证不被中断（`fail-fast: false`）

#### Scenario: 手动触发仅验证构建

- **WHEN** 通过 workflow_dispatch 手动触发工作流（非标签）
- **THEN** 系统 SHALL 仅执行构建与产物上传，不创建 Release

### Requirement: 平台化打包裁剪

系统 SHALL 按目标平台裁剪 ffprobe-static 的非目标平台二进制，并保证 ncm-cli 数据功能依赖的包随包分发：Windows 包排除 darwin/linux（及 win32/ia32）二进制，macOS 包排除 win32/linux 二进制；`ffprobe-static` 包本身与 `fluent-ffmpeg` SHALL 始终随包分发（ncm-cli 启动时探测二者模块存在性，任一缺失即静默降级为无数据命令的精简模式）。

#### Scenario: Windows 构建裁剪

- **WHEN** 构建 Windows 安装包
- **THEN** 包内 SHALL 仅保留 ffprobe-static 的 win32/x64 二进制，darwin/linux/win32-ia32 二进制被排除

#### Scenario: macOS 构建裁剪

- **WHEN** 构建 macOS 安装包
- **THEN** 包内 SHALL 仅保留 ffprobe-static 的 darwin 二进制（x64 与 arm64），win32/linux 二进制被排除

#### Scenario: 探测依赖始终随包分发

- **WHEN** 任一平台构建
- **THEN** `ffprobe-static` 与 `fluent-ffmpeg` 两个包 SHALL 完整存在于打包产物中

#### Scenario: Windows 专用辅助脚本仅随 Windows 包分发

- **WHEN** 构建 macOS 安装包
- **THEN** `ncm-configure.bat` / `ncm-configure.exe`（Windows 专用遗留排查入口）SHALL NOT 被打包进 macOS 产物

### Requirement: 安装包死重依赖排除与语言裁剪

系统 SHALL 在打包配置中排除运行时无引用的死重依赖——vue/@vue 全家桶（渲染层已由 Vite 预打包）、@babel 编译链（仅 @vue/compiler-* 依赖）、@biomejs lint 工具（rate-limit-threshold 误声明的生产依赖，运行时零引用）、fluent-ffmpeg 覆盖率目录（npm 误发布的 jest 输出）、better-sqlite3 构建源文件（deps/src/binding.gyp，仅 node-gyp 构建时需要）——并将 Electron 语言包裁剪为 zh-CN 与 en-US，以控制安装包与安装后体积。

#### Scenario: 死重依赖不随包分发

- **WHEN** 任一平台构建安装包
- **THEN** 打包产物 SHALL NOT 包含 node_modules 下的 `vue`、`@vue`、`@babel`、`@biomejs` 目录、`fluent-ffmpeg/coverage` 目录、`better-sqlite3` 的 `deps`/`src` 目录与 `binding.gyp`

#### Scenario: 运行时依赖完整保留

- **WHEN** 任一平台构建安装包
- **THEN** `ffprobe-static` 与 `fluent-ffmpeg`（除 coverage 外）SHALL 完整随包分发
- **AND** `better-sqlite3` 的 `build/Release/better_sqlite3.node`、`lib/` 与 `package.json` SHALL 保留（主进程数据库功能可用）

#### Scenario: 语言包裁剪

- **WHEN** 任一平台构建安装包
- **THEN** Electron 运行时 SHALL 仅携带 zh-CN 与 en-US 语言包，其余 locales SHALL NOT 随包分发

### Requirement: Windows 构建捆绑 mpv

系统 SHALL 在发布流水线的 Windows 构建中于打包前执行 `npm run fetch-mpv`（按 `build/mpv-manifest.json` 锁定的版本下载 7z 归档、SHA256 校验、解压到 `build/mpv`），并将 `build/mpv` 打入 Windows 安装包 `resources/mpv`；拉取失败 SHALL 中止 Windows 构建，SHALL NOT 产出无 mpv 的安装包。macOS 构建 SHALL NOT 捆绑 mpv（mpv 由用户经 brew 安装，fetch 脚本按平台自动跳过）。

#### Scenario: Windows 构建拉取并打包 mpv

- **WHEN** 发布流水线在 windows-latest runner 上执行
- **THEN** 在 `npm run dist` 之前 SHALL 执行 `npm run fetch-mpv`（下载、SHA256 校验、解压到 `build/mpv`）
- **AND** 构建产物 SHALL 包含 `resources/mpv/mpv.exe`（electron-builder `win.extraResources` 产物）

#### Scenario: mpv 拉取失败中止构建

- **WHEN** `npm run fetch-mpv` 因网络异常、SHA256 不匹配或解压失败退出非零
- **THEN** Windows 构建 SHALL 失败，SHALL NOT 产出无 mpv 的安装包；macOS 构建不受影响（`fail-fast: false`）

#### Scenario: macOS 构建不捆绑 mpv

- **WHEN** 发布流水线在 macOS runner 上执行
- **THEN** `npm run fetch-mpv` SHALL 按平台自跳（非 win32 无操作），产物 SHALL NOT 包含 mpv

### Requirement: macOS 无签名构建与分发

系统 SHALL 以无签名方式构建 macOS 安装包（构建环境 `CSC_IDENTITY_AUTO_DISCOVERY=false`，跳过证书自动发现，electron-builder 退化为 ad-hoc 签名），产物可在 arm64 Mac 上本地运行；下载分发的应用受 Gatekeeper 隔离，文档 SHALL 说明首次打开的绕过方式。

#### Scenario: 无签名构建

- **WHEN** 在 macOS runner 上执行打包
- **THEN** 系统 SHALL 不执行正式代码签名与公证，产物为 ad-hoc 签名（满足 arm64 macOS 运行的最低要求）

#### Scenario: Gatekeeper 绕过说明

- **WHEN** 用户从 GitHub Release 下载 macOS 安装包并首次打开应用
- **THEN** 文档 SHALL 说明 Gatekeeper 可能阻止打开（应用未签名且带隔离属性），并给出绕过方式（右键 → 打开，或 `xattr -cr`）
