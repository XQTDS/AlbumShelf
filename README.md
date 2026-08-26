# AlbumShelf 📀

网易云音乐专辑收藏管理工具，支持 MusicBrainz 数据补全。

将你在网易云音乐收藏的专辑同步到本地，建立一张属于自己的「专辑墙」，并通过 MusicBrainz 自动补全评分、风格等元数据，方便浏览、筛选与回顾。

## ✨ 功能特性

- **网易云同步**：通过内置的 [ncm-cli](https://www.npmjs.com/package/@music163/ncm-cli) 拉取收藏的专辑（含曲目列表），支持增量同步与「取消收藏即删除」；同步过程实时显示进度条（拉取阶段显示已获取张数，写入阶段显示 X/Y 比例）
- **专辑墙浏览**：网格视图 + 表格视图自由切换；封面本地缓存（`cover://` 协议）秒开，支持批量补全封面；悬停唱片墙卡片即可一键播放整张专辑；卡片角标（实体图标/我的评分/MB评分/发行日期）可独立开关显示，按对应字段排序时角标固定显示
- **专辑详情**：点击任意专辑展开详情面板，展示封面、艺术家、发行时间、MB 评分、曲目列表、网易云热评等完整信息
- **实体收藏**：在详情面板标记你拥有的实体介质（黑胶/CD/磁带，可多选），标记显示在表格视图「实体」列与唱片墙卡片左上角（唱片墙角标可开关）
- **内置播放**：播放整张专辑或单曲，底部常驻播放条提供播放/暂停、上一首/下一首、可点击跳转的进度条（已播/总时长）、音量控制与正在播放的歌曲/艺术家展示（超长文本缓慢滚动显示，点击封面直达对应专辑详情；基于内置 ncm-cli 播控命令）；一键播放专辑时播放条秒出，剩余曲目在后台自动补入队列；Windows 安装包内置 mpv 播放器（macOS 需 `brew install mpv`），开箱即播
- **MusicBrainz 数据补全**：新专辑入库自动匹配 MB 评分与风格标签，支持模糊匹配人工确认（非阻塞队列：弹窗依次弹出，批量补全流程在后台继续）、艺术家别名、匹配策略开关
- **搜索**：本地按专辑名 / 艺术家搜索；在线搜索网易云音乐专辑并一键收藏
- **筛选**：艺术家自动补全筛选、多风格 AND 筛选、风格统计面板（点击风格标签即可筛选）
- **关注艺术家**：专辑详情面板中点击艺术家芯片即可关注/取关（表格与唱片墙以纯文本展示，已关注艺术家名以金色文字显示），工具栏「★ 已关注」一键筛选已关注艺术家的专辑，菜单「工具 → 关注列表」打开独立的关注列表窗口统一管理（专辑数、关注日期、跨窗口实时同步）；同步与在线添加保留艺术家网易云 ID，为后续「关注艺术家的新专辑」等能力铺路
- **个性化**：用户评分（0.5–5.0）、手动编辑风格标签、随机选择「今天听哪张」
- **数据维护**：网易云专辑收藏一致性同步、批量补全缺失封面、批量回填缺失发行日期（`ncm-cli album get` 的 publishTime，按北京时间换算，仅填充空值不覆盖已有数据）、批量回填艺术家 ID（老库专辑补齐网易云艺术家 ID，菜单「数据 → 回填艺术家 ID」，回填完成后自动为已关注艺术家补齐 ID）、扫码登录
- **体验细节**：窗口尺寸 / 位置持久化、滚动进度条、设置面板、帮助菜单（「关于」弹窗）

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

### mpv 播放器（Windows 内置，macOS 需自装）

播放功能依赖 mpv（ncm-cli 的播放后端）：

- **Windows 安装包**：内置 mpv（安装目录 `resources/mpv`），**无需安装任何外部播放器**即可播放，优先于用户自装 mpv
- **macOS**：需自装 mpv（`brew install mpv`）
- **Windows 开发模式**：执行 `npm run fetch-mpv` 拉取 mpv 到 `build/mpv`（自动跳过非 Windows 平台）；未拉取时回落到系统 PATH 中的 mpv

### 配置网易云同步（启用同步功能时需要）

ncm-cli 已作为依赖内置，**无需全局安装 Node 与 ncm-cli**。网易云 API 凭证已内置到应用中，启动时自动写入本地加密配置（`~/.config/ncm-cli/`，与安装包版共用），**无需手动配置**。首次使用直接扫码登录即可：

1. 扫码登录（菜单「账户 → 登录」）
2. 之后即可使用同步、在线搜索、热评等全部网易云功能

> 遗留备用入口：源码环境可执行 `npm run ncm-cli -- configure` 交互式向导、安装包用户可双击 `resources\ncm-configure.bat`（仅用于排查配置异常；应用启动时会自动恢复为内置凭证）。

## 🛠 常用命令

在 `album-shelf/` 目录下执行：

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发模式（热更新） |
| `npm run build` | 构建产物到 `out/` |
| `npm run typecheck` | 类型检查（node + web） |
| `npm run fetch-mpv` | 拉取并校验 mpv 到 `build/mpv`（Windows 专用，自动跳过其他平台） |
| `npm run pack` | 构建并打包为免安装目录 |
| `npm run dist` | 构建并打包为安装包（Windows NSIS / macOS dmg+zip，按当前平台） |

## 📦 发版流程

采用 `main` + `release` 双分支策略，由 GitHub Actions 自动构建发布：

1. 日常开发提交到 `main` 分支
2. 需要发版时，将 `main` 合并到 `release`，并按需在 `album-shelf/package.json` 中更新版本号
3. 在 `release` 分支上打版本标签：`git tag v1.0.0 && git push origin v1.0.0`
4. 推送标签后 GitHub Actions 自动构建 Windows NSIS 安装包与 macOS arm64 安装包（dmg/zip）并创建 GitHub Release（附自动生成的更新说明）；Windows 构建会在打包前自动拉取并捆绑 mpv（拉取或校验失败即中止构建），macOS 不捆绑 mpv

手动触发构建（不创建 Release）可在仓库 Actions 页面点击 Release workflow 的「Run workflow」。安装包未配置代码签名：Windows 安装时可能出现 SmartScreen 提示；macOS 首次打开需右键 → 打开绕过 Gatekeeper（安装与使用说明详见 [INSTALL.md](album-shelf/INSTALL.md)）。

## 💾 数据存储

应用数据保存在 Electron `userData` 目录（SQLite 数据库），包括：

- 专辑、曲目表及评分、风格等元数据（含专辑的结构化艺术家数据 `artists`（JSON `{name, originalId, id}`，随导出文件保留）与关注艺术家表 `followed_artist`）
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
| mpv（Windows 内置） | 播放后端；Windows 安装包内置（构建时经 `fetch-mpv` 拉取锁定版本），macOS 需 `brew install mpv` |
| musicbrainz-api | MusicBrainz 数据补全 |
| electron-builder | 打包分发 |

## 🔗 相关链接

- [ncm-cli 安装指南](https://www.npmjs.com/package/@music163/ncm-cli)
- [网易云音乐开放平台入驻指南](https://developer.music.163.com/st/developer/document?docId=9504d35aa41a47c6ac9830b2dbf48f94)
- [MusicBrainz](https://musicbrainz.org/)
