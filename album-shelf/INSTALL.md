# AlbumShelf 安装指南

网易云音乐专辑收藏管理工具，支持 MusicBrainz 数据补全。

---

## 📦 方式一：安装包（推荐，无需 Node.js 环境）

网易云同步所需的 ncm-cli 已内置在安装包中，**无需预装 Node.js 和 ncm-cli**。

### Windows

1. 从 [GitHub Releases](https://github.com/XQTDS/AlbumShelf/releases) 下载最新版 `AlbumShelf Setup <版本>.exe` 并安装（未签名，SmartScreen 提示时选择「仍要运行」）
2. **登录授权**：打开应用，在「账户」菜单或登录引导弹窗中扫码登录（网易云 API 凭证已内置，启动时自动写入本地加密配置 `~/.config/ncm-cli/`，无需手动配置）
3. 之后即可使用同步、在线搜索、热评等全部功能

> 遗留备用：双击安装目录下 `resources\ncm-configure.bat` 可运行交互式配置向导（不需要系统安装 Node.js），仅用于排查配置异常；应用启动时会自动恢复为内置凭证。

### macOS（Apple Silicon）

1. 从 [GitHub Releases](https://github.com/XQTDS/AlbumShelf/releases) 下载最新版 `AlbumShelf-<版本>-arm64.dmg`（或 `.zip`），打开 dmg 后将 AlbumShelf 拖入「应用程序」
2. **首次打开**：应用未签名，Gatekeeper 会阻止直接打开——在「访达」中**右键应用 → 打开**，确认后即可正常使用（之后无需重复）
3. **登录授权**：打开应用，在「账户」菜单或登录引导弹窗中扫码登录（凭证已内置，自动写入 `~/.config/ncm-cli/`，无需手动配置）
4. 之后即可使用同步、在线搜索、热评等全部功能

> 首次运行数据功能时如弹出「安装 Rosetta」提示（ffprobe 辅助二进制为 x64），按提示安装即可。

---

## 🛠️ 方式二：从源码构建

### 必需环境

| 依赖 | 要求 |
|------|------|
| Node.js | >= 18（https://nodejs.org/） |
| npm | 随 Node.js 一起安装 |

### 安装与运行

```bash
cd album-shelf

# 安装依赖（better-sqlite3 为原生模块，会自动 rebuild）
npm install

# 启动开发模式
npm run dev
```

### 配置网易云同步（启用同步功能时需要）

ncm-cli 已作为项目依赖内置，无需全局安装。网易云 API 凭证已内置到应用中，启动时自动写入本地加密配置（`~/.config/ncm-cli/`），**无需手动配置**，首次使用直接扫码登录即可：

1. 启动应用后扫码登录（菜单「账户 → 登录」）
2. 之后即可使用同步、在线搜索、热评等全部网易云功能

> 遗留备用：在终端执行 `npm run ncm-cli -- configure` 可走交互式向导（仅用于排查配置异常；应用启动时会自动恢复为内置凭证）。

> 如需在终端直接使用 CLI 的完整能力（播放、歌单管理等），可自行选择全局安装：`npm install -g @music163/ncm-cli`（与内置版本共用同一份配置与登录状态，版本需一致，当前为 0.1.7）。

---

## 📦 项目依赖

项目使用的主要技术栈：

| 依赖 | 说明 |
|------|------|
| **Electron** | 桌面应用框架 |
| **Vue 3** | 前端框架 |
| **better-sqlite3** | 本地数据库 |
| **@music163/ncm-cli** | 网易云音乐 CLI（内置，随安装包分发） |
| **musicbrainz-api** | MusicBrainz 数据补全 |
| **electron-vite** | 构建工具 |

---

## ⚠️ 常见问题

| 问题 | 解决方法 |
|------|----------|
| 同步提示「请先登录」 | 在应用内扫码登录（菜单「账户 → 登录」） |
| 登录时报错提示未配置 API 凭证 | 凭证由应用启动时自动写入，重启应用重试；仍失败时可用遗留备用入口排查：`resources\ncm-configure.bat`（安装包）或 `npm run ncm-cli -- configure`（源码） |
| 登录超时 | 二维码过期，重新打开登录弹窗扫码 |
| macOS 提示「无法验证开发者」/无法打开 | 应用未签名：在访达中右键（或 Control+点击）应用 → 打开；仍不行时在终端执行 `xattr -cr /Applications/AlbumShelf.app` 后重新打开 |
| macOS 弹出「安装 Rosetta」提示 | 数据功能依赖的 ffprobe 辅助二进制为 x64 架构，按提示安装 Rosetta 2 即可 |
| better-sqlite3 编译失败 | 确保安装了 Python 和 C++ 编译工具（Windows 需要 windows-build-tools；macOS 需要 Xcode Command Line Tools） |

### Windows 用户注意

如果在 Windows 上遇到 native 模块编译问题（仅源码构建场景），可能还需要安装：

```bash
npm install -g windows-build-tools
```

---

## 📝 相关链接

- [ncm-cli 安装指南](https://www.npmjs.com/package/@music163/ncm-cli)
- [网易云音乐开放平台入驻指南](https://developer.music.163.com/st/developer/document?docId=9504d35aa41a47c6ac9830b2dbf48f94)
- [MusicBrainz](https://musicbrainz.org/)
