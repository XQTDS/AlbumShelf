# AlbumShelf 📀

网易云音乐专辑收藏管理工具，支持 MusicBrainz 数据补全。

将你在网易云音乐收藏的专辑同步到本地，建立一张属于自己的「专辑墙」，并通过 MusicBrainz 自动补全评分、风格等元数据，方便浏览、筛选与回顾。

## ✨ 功能特性

- **网易云同步**：通过内置的 [ncm-cli](https://www.npmjs.com/package/@music163/ncm-cli) 拉取收藏的专辑（含曲目列表），支持增量同步与「取消收藏即删除」
- **专辑墙浏览**：网格视图 + 表格视图自由切换；封面本地缓存（`cover://` 协议）秒开，支持批量补全封面
- **专辑详情**：点击任意专辑展开详情面板，展示封面、艺术家、发行时间、MB 评分、曲目列表、网易云热评等完整信息
- **MusicBrainz 数据补全**：新专辑入库自动匹配 MB 评分与风格标签，支持模糊匹配人工确认、艺术家别名、匹配策略开关
- **搜索**：本地按专辑名 / 艺术家搜索；在线搜索网易云音乐专辑并一键收藏
- **筛选**：艺术家自动补全筛选、多风格 AND 筛选、风格统计面板（点击风格标签即可筛选）
- **个性化**：用户评分（0.5–5.0）、手动编辑风格标签、随机选择「今天听哪张」
- **数据维护**：网易云专辑收藏一致性同步、扫码登录
- **体验细节**：窗口尺寸 / 位置持久化、滚动进度条、设置面板

## 🗂 仓库结构

| 目录 | 说明 |
|------|------|
| [album-shelf/](album-shelf/) | Electron 桌面应用主工程 |
| [ncm-skills/](ncm-skills/) | git submodule：基于 ncm-cli 的网易云音乐 AI Agent 技能包 |
| [openspec/](openspec/) | OpenSpec 规范文档（能力 spec、变更记录） |
| `data/`、`scripts/` | 本地数据与工具脚本（已被 `.gitignore` 忽略，不入库） |

## 🚀 快速开始

### 环境要求

- Node.js >= 18

### 安装与运行

```bash
# 克隆仓库（ncm-skills 是 submodule，需要一并拉取）
git clone --recurse-submodules https://github.com/XQTDS/AlbumShelf.git
cd AlbumShelf/album-shelf

# 安装依赖（better-sqlite3 为原生模块，会自动 rebuild）
npm install

# 启动开发模式
npm run dev
```

### 配置网易云同步（启用同步功能时需要）

ncm-cli 已作为依赖内置，**无需全局安装 Node 与 ncm-cli**。首次使用只需一次性配置 API 凭证，之后在应用内扫码登录即可：

1. 前往[网易云音乐开放平台](https://developer.music.163.com/st/developer/apply/account?type=INDIVIDUAL)申请 API Key（appId 和 privateKey）
2. 执行 `npm run ncm-cli -- configure` 完成配置（凭证保存在用户主目录，与安装包版共用）
3. 启动应用后扫码登录（菜单「账户 → 登录」）

安装包用户的配置方式（无需 Node 环境）与详细步骤见 [album-shelf/INSTALL.md](album-shelf/INSTALL.md)。

## 🛠 常用命令

在 `album-shelf/` 目录下执行：

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发模式（热更新） |
| `npm run build` | 构建产物到 `out/` |
| `npm run typecheck` | 类型检查（node + web） |
| `npm run pack` | 构建并打包为免安装目录 |
| `npm run dist` | 构建并打包为安装包（NSIS） |

## 📦 发版流程

采用 `main` + `release` 双分支策略，由 GitHub Actions 自动构建发布：

1. 日常开发提交到 `main` 分支
2. 需要发版时，将 `main` 合并到 `release`，并按需在 `album-shelf/package.json` 中更新版本号
3. 在 `release` 分支上打版本标签：`git tag v1.0.0 && git push origin v1.0.0`
4. 推送标签后 GitHub Actions 自动构建 NSIS 安装包并创建 GitHub Release（附自动生成的更新说明）

手动触发构建（不创建 Release）可在仓库 Actions 页面点击 Release workflow 的「Run workflow」。安装包未配置代码签名，安装时可能出现 Windows SmartScreen 提示。

## 💾 数据存储

应用数据保存在 Electron `userData` 目录（SQLite 数据库），包括：

- 专辑、曲目表及评分、风格等元数据
- 封面本地缓存
- `settings.json`（应用设置，如 MusicBrainz 匹配策略开关）
- `mb-credentials.json`（MusicBrainz 凭据，使用系统加密存储）
- `window-state.json`（窗口状态持久化）

## 📐 规范驱动开发

本项目采用 OpenSpec 规范驱动开发流程：

- `openspec/specs/` — 各能力的当前行为约定（如 album-search、data-sync、album-list-ui 等）
- `openspec/changes/` — 进行中的变更文档（proposal / design / tasks）
- `openspec/changes/archive/` — 已归档的历史变更

新需求的开发流程约定见 [CLAUDE.md](CLAUDE.md)。

## 📚 技术栈

| 技术 | 用途 |
|------|------|
| Electron 36 | 桌面应用框架 |
| Vue 3 + TypeScript | 渲染层 UI |
| electron-vite | 构建工具 |
| better-sqlite3 | 本地数据库 |
| @music163/ncm-cli（内置） | 网易云音乐 CLI，随安装包分发，无需用户另行安装 |
| musicbrainz-api | MusicBrainz 数据补全 |
| electron-builder | 打包分发 |

## 🔗 相关链接

- [ncm-cli 安装指南](https://www.npmjs.com/package/@music163/ncm-cli)
- [网易云音乐开放平台入驻指南](https://developer.music.163.com/st/developer/document?docId=9504d35aa41a47c6ac9830b2dbf48f94)
- [MusicBrainz](https://musicbrainz.org/)
