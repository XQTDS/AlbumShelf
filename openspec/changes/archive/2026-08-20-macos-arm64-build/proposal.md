## Why

AlbumShelf 目前只有 Windows 平台的构建与发布：CI 在 `windows-latest` 上构建 NSIS 安装包，GitHub Release 只承载 `.exe`。Mac 用户无法获得安装包（源码构建门槛高），需要将 macOS 纳入发版管线。

应用代码层面已具备 macOS 适配基础（macOS 应用菜单、`window-all-closed` 不退出、`activate` 重建窗口等处理均已在位），本次改造聚焦打包配置与 CI，打通 macOS arm64（Apple Silicon）的无签名构建与发布。

## What Changes

- **打包配置**：[package.json](../../../album-shelf/package.json) 新增 `mac` 段（target dmg + zip，arch 锁定 arm64，`public.app-category.music` 分类，`${arch}` 命名产物）；ffprobe 二进制裁剪改为按平台作用（macOS 包保留 darwin 二进制）；Windows 专用辅助脚本（`ncm-configure.bat`/`.exe`）的 `extraResources` 移入 `win` 段
- **CI 工作流**：[release.yml](../../../.github/workflows/release.yml) 改为矩阵构建（`windows-latest` + `macos-15`），各平台产物上传为 artifact，由新增的 release job 汇总后统一创建 GitHub Release；macOS 构建以 `CSC_IDENTITY_AUTO_DISCOVERY=false` 跳过签名发现（无签名发布）
- **文档同步**：README.md 与 INSTALL.md 补充 macOS 安装说明（dmg 安装、Gatekeeper 首次打开绕过、Rosetta 提示）

## Capabilities

### Added Capabilities

- `release-pipeline`：发版管线首次形成 spec——v* 标签触发矩阵构建、平台化打包裁剪规则、macOS 无签名构建与分发约定

## Non-goals

- 不做 Intel x64 Mac 构建（`macos-15-intel` runner 2027-08 退役，届时再评估；架构追加只需矩阵加一项）
- 不做代码签名与公证（Apple Developer 证书与 notarytool 公证为后续独立 change）
- 不做应用图标（现状 Windows 的 `build/icon.ico` 引用同样缺失、使用 Electron 默认图标，macOS 与其对等）
- 不引入自动更新（dmg 之外同时产出 zip 仅为分发便利，不接 electron-updater）
- 不动 ncm-cli 依赖与 ffprobe-static 版本（darwin arm64 二进制的社区疑点列为真机验证项，见 design.md）

## Impact

- **打包配置**：[package.json](../../../album-shelf/package.json) `build` 段（新增 `mac`，`files`/`extraResources` 平台化重排）
- **CI**：[release.yml](../../../.github/workflows/release.yml) 重构为矩阵 + 汇总发布两阶段
- **文档**：[README.md](../../../README.md)、[INSTALL.md](../../../album-shelf/INSTALL.md)
- **Windows 产物**：文件名与内容不变（NSIS 安装包，`extraResources` 移入 `win` 段后打包布局不变）
- **运行时行为**：应用代码零改动；macOS 上 ncm-cli 数据功能依赖的 ffprobe 探测逻辑与 Windows 一致（包存在性探测），凭证与登录状态沿用 `~/.config/ncm-cli/`
