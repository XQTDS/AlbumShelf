# AlbumShelf 安装指南

网易云音乐专辑收藏管理工具，支持 MusicBrainz 数据补全。

---

## 📦 方式一：安装包（推荐，无需 Node.js 环境）

网易云同步所需的 ncm-cli 已内置在安装包中，**无需预装 Node.js 和 ncm-cli**。

1. 从 [GitHub Releases](https://github.com/XQTDS/AlbumShelf/releases) 下载最新版 NSIS 安装包并安装
2. **一次性配置 API 凭证**：前往 [网易云音乐开放平台](https://developer.music.163.com/st/developer/apply/account?type=INDIVIDUAL) 完成入驻并申请 API Key（appId 和 privateKey），然后双击安装目录下 `resources\ncm-configure.bat`，按向导完成配置（凭证保存在用户主目录，与开发版共用）
3. **登录授权**：打开应用，在「账户」菜单或登录引导弹窗中扫码登录
4. 之后即可使用同步、在线搜索、热评等全部功能

> 提示：`ncm-configure.bat` 通过应用内置运行时执行配置向导，不需要系统安装 Node.js。

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

ncm-cli 已作为项目依赖内置，无需全局安装。首次使用只需：

1. 前往 [网易云音乐开放平台](https://developer.music.163.com/st/developer/apply/account?type=INDIVIDUAL) 申请 API Key（appId 和 privateKey）
2. 执行 `npm run ncm-cli -- configure` 完成配置（凭证保存在用户主目录）
3. 启动应用后扫码登录

> 如需在终端直接使用 CLI 的完整能力（播放、歌单管理等），可自行选择全局安装：`npm install -g @music163/ncm-cli`（与内置版本共用同一份配置与登录状态，版本需一致，当前为 0.1.6）。

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
| 登录时报错提示未配置 API 凭证 | 先运行 `resources\ncm-configure.bat`（安装包）或 `npm run ncm-cli -- configure`（源码）完成配置 |
| 登录超时 | 二维码过期，重新打开登录弹窗扫码 |
| better-sqlite3 编译失败 | 确保安装了 Python 和 C++ 编译工具（Windows 需要 windows-build-tools） |

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
