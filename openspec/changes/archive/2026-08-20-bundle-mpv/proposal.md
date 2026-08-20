# 提案：Windows 安装包内置 mpv，开箱即播

## 背景

- ncm-cli 的 `play`/`queue` 播放功能依赖外部 mpv。实测（2026-08-20）确认 ncm-cli 0.1.6 **无任何 mpv 路径配置入口**：`config set player <路径>` 被拒（仅接受 `mpv|orpheus` 枚举），`play` 无 `--player-path` 选项；运行时由 PlayerDaemon 子进程从环境变量 PATH 中按名字解析 `mpv`。
- 当前 Windows 安装包不含 mpv（`extraResources` 仅 ncm-configure 向导），README 对播放的前置条件只字未提。新用户安装后直接点播放即失败（`mpv not found`），且无任何引导。
- 关键可行性验证（本会话实测）：构造隔离 PATH 只放一个 mpv.exe → ncm-cli 的 PlayerDaemon 精确 spawn 了该文件。**证明只要在 spawn ncm-cli 时把捆绑目录注入 PATH，即可接管 mpv 解析，无需修改 ncm-cli**。

## 目标

1. Windows x64 安装包内置 mpv 可执行文件，开箱即播，不依赖用户自行安装。
2. 开发环境提供一条命令（`npm run fetch-mpv`）拉取同一 mpv 二进制，使 dev 播放行为与打包版一致。
3. CI 构建自动拉取 mpv；拉取失败时显式中止 Windows 构建，杜绝静默产出"不带 mpv"的安装包。

## 非目标

- **macOS 捆绑 mpv**：无官方 arm64 二进制分发渠道（brew 是标准安装路径），且涉及 dylib 依赖与签名复杂度。mac 用户继续通过 `brew install mpv`（ncm-cli-setup skill 已覆盖该流程）。
- 播放后端切换、UI 播放器选择、mpv 自动升级机制。
- 改动 ncm-cli 播放命令的既有行为约定（队列边界、状态轮询、超时等一律不动）。
