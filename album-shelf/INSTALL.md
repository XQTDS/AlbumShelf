# AlbumShelf 安装指南

网易云音乐专辑收藏管理工具，支持 MusicBrainz 数据补全。

---

## 🖥️ 必需环境

### 1. Node.js
- **版本要求**：>= 18
- 下载地址：https://nodejs.org/

### 2. npm
- 随 Node.js 一起安装
- 用于安装项目依赖

---

## 🔧 可选/进阶依赖

### 3. ncm-cli（网易云音乐 CLI 工具）

如果需要使用同步功能，需要安装和配置 ncm-cli：

```bash
npm install -g @music163/ncm-cli
```

安装后还需要：

1. **申请 API Key**：前往 [网易云音乐开放平台](https://developer.music.163.com/st/developer/apply/account?type=INDIVIDUAL) 完成入驻并申请 API Key（appId 和 privateKey）
2. **配置**：执行 `ncm-cli configure` 完成配置
3. **登录授权**：执行 `ncm-cli login` 完成登录

---

## 📦 项目依赖

项目使用的主要技术栈：

| 依赖 | 说明 |
|------|------|
| **Electron** | 桌面应用框架 |
| **Vue 3** | 前端框架 |
| **better-sqlite3** | 本地数据库 |
| **musicbrainz-api** | MusicBrainz 数据补全 |
| **electron-vite** | 构建工具 |

---

## 🚀 安装步骤

```bash
# 1. 进入项目目录
cd album-shelf

# 2. 安装依赖
npm install

# 3. 启动开发模式
npm run dev

# 4. 或打包构建
npm run build
```

---

## ⚠️ 常见问题

| 问题 | 解决方法 |
|------|----------|
| `ncm-cli: command not found` | 检查 npm 全局 bin 是否在 PATH 中 |
| 登录超时 | 重新执行 `ncm-cli login` |
| better-sqlite3 编译失败 | 确保安装了 Python 和 C++ 编译工具（Windows 需要 windows-build-tools） |

### Windows 用户注意

如果在 Windows 上遇到 native 模块编译问题，可能还需要安装：

```bash
npm install -g windows-build-tools
```

---

## 📝 相关链接

- [ncm-cli 安装指南](https://www.npmjs.com/package/@music163/ncm-cli)
- [网易云音乐开放平台入驻指南](https://developer.music.163.com/st/developer/document?docId=9504d35aa41a47c6ac9830b2dbf48f94)
- [MusicBrainz](https://musicbrainz.org/)
