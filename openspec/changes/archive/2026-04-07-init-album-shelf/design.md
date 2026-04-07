## Context

AlbumShelf 是一个全新的桌面应用项目。用户在网易云音乐上收藏了大量专辑，但网易云缺乏评分、风格标签等元数据维度的管理能力。本项目将这些数据同步到本地，并通过 MusicBrainz 补全元数据，以表格形式提供排序、筛选和搜索功能。

技术约束：
- 用户本地已安装 ncm-cli 官方模块（[官方文档](https://developer.music.163.com/st/developer/document?docId=2327e302009c437eb02af48f63d6e514)），npm 包名为 `@music163/ncm-cli`
- **ncm-cli 当前版本尚不支持获取用户收藏专辑列表，下个版本将支持**。代码中需预留同步接口，暂用 mock 数据实现
- 相关 skills 参考：`ncm-skills/` 目录（来自 https://github.com/NetEase/skills）
- MusicBrainz API 对自定义 User-Agent 无速率限制，但建议合理控制请求频率
- 用户已有 MusicBrainz 账号，可用用户名/密码认证（评分和标签获取需要认证）
- 桌面应用需在 Windows 环境下运行

## Goals / Non-Goals

**Goals:**
- 构建完整的 Electron + Vue 3 桌面应用工程脚手架
- 预留网易云专辑收藏同步接口，暂用 mock 数据验证完整流程
- 实现 MusicBrainz 数据自动匹配与补全（评分、风格）
- 提供可排序、可筛选、可搜索的专辑列表界面
- 数据持久化到本地 SQLite 数据库

**Non-Goals:**
- 不做专辑封面的网格/瀑布流视图（仅列表表格视图）
- 不做评论/评价内容的抓取和展示
- 不做定时自动同步（仅手动触发）
- 不做多用户支持（单用户本地应用）
- 不做音乐播放功能

## Decisions

### 1. Electron 工程结构：使用 electron-vite 脚手架

**选择**：使用 `electron-vite` 作为工程构建工具

**原因**：electron-vite 原生支持 Vue 3，提供了 main/preload/renderer 三层结构的开箱即用配置，比手动配置 Electron + Vite 更高效。

**替代方案**：
- electron-forge：更通用但 Vue 集成需要额外配置
- 手动配置 Electron + Vite：灵活但搭建成本高

### 2. SQLite 绑定：使用 better-sqlite3

**选择**：使用 `better-sqlite3` 在 Electron 主进程中操作 SQLite

**原因**：better-sqlite3 是同步 API，性能优秀，在 Electron 主进程中使用简单直接。通过 IPC 暴露给渲染进程。

**替代方案**：
- sql.js：纯 WASM 实现，无需原生编译，但性能稍差
- knex.js + better-sqlite3：加一层查询构建器，当前规模不必要

### 3. 进程间通信：Electron IPC + contextBridge

**选择**：主进程负责所有数据操作（SQLite、网络请求），渲染进程通过 preload 脚本暴露的 API 调用

**原因**：
- 安全：渲染进程不直接访问 Node.js API
- 清晰：数据层与 UI 层分离
- 标准：遵循 Electron 安全最佳实践

```
┌─────────────────────────────────────────────────┐
│  Renderer Process (Vue 3)                       │
│  ┌───────────────────────────────────────────┐  │
│  │  Vue Components (表格、筛选器、搜索框)     │  │
│  └──────────────────┬────────────────────────┘  │
│                     │ window.electronAPI         │
│  ┌──────────────────▼────────────────────────┐  │
│  │  Preload Script (contextBridge)            │  │
│  └──────────────────┬────────────────────────┘  │
├─────────────────────┼───────────────────────────┤
│  Main Process       │ ipcMain.handle()          │
│  ┌──────────────────▼────────────────────────┐  │
│  │  Service Layer                             │  │
│  │  ├── SyncService (ncm-cli 同步)           │  │
│  │  ├── EnrichService (MusicBrainz 补全)     │  │
│  │  └── AlbumService (CRUD + 查询)           │  │
│  └──────────────────┬────────────────────────┘  │
│  ┌──────────────────▼────────────────────────┐  │
│  │  Database Layer (better-sqlite3 + SQLite) │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 4. 网易云数据获取：接口预留 + Mock 数据过渡

**选择**：定义 `SyncService` 抽象接口，当前使用 `MockSyncService` 实现，待 ncm-cli 下个版本支持收藏专辑列表后，替换为 `NcmCliSyncService` 实现。

**原因**：ncm-cli 当前版本尚不支持获取用户收藏专辑列表，但下个版本将支持。预留接口确保未来无缝切换，mock 数据可用于当前阶段验证完整的数据补全和 UI 展示流程。

**接口设计**：
```typescript
interface SyncService {
  // 获取用户收藏的专辑列表
  fetchCollectedAlbums(): Promise<NeteaseAlbum[]>
  // 检查登录状态
  checkLoginStatus(): Promise<boolean>
}
```

**Mock 数据**：提供 10-20 条真实专辑数据作为种子数据，覆盖不同年代、风格和艺术家，确保 UI 功能可完整测试。

### 5. MusicBrainz API 调用：使用 musicbrainz-api 库

**选择**：使用官方推荐的 Node.js 库 `musicbrainz-api`（v1.2.0，[GitHub](https://github.com/Borewit/musicbrainz-api)）

**原因**：
- 官方推荐的 Node.js 实现，与 Electron 技术栈一致
- 内置 Release Group 搜索、评分和标签获取
- 支持用户名/密码认证（获取评分和标签需要认证）
- 内置 Cover Art Archive 支持（为未来扩展预留）

**替代方案**：
- 直接 fetch 调用 REST API：可行但需手动处理认证、序列化等逻辑
- Python musicbrainzngs + 子进程：引入额外语言依赖，增加复杂度

**认证方式**：用户名/密码认证，在应用设置中配置 MusicBrainz 凭据，存储在本地配置文件中。

### 6. MusicBrainz 匹配策略：按专辑名 + 艺术家搜索匹配

**选择**：通过 `musicbrainz-api` 搜索 Release Group，以专辑名 + 艺术家名作为查询条件，取最佳匹配结果

**补全流程**：
1. 使用 `searchReleaseGroup({ query: albumName, artist: artistName })` 搜索
2. 取 score 最高的 Release Group
3. 通过 `getReleaseGroup(mbid, { inc: ['ratings', 'tags'] })` 获取评分和风格标签
4. 写入本地数据库

### 7. 速率控制：礼貌性限制

**选择**：设置 5 req/s 的请求间隔（200ms），而非之前认为的 1 req/s

**原因**：根据 MusicBrainz [Rate Limiting 文档](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)，对自定义 User-Agent 实际上不做限制（直接放行）。限制 50 req/s 仅针对匿名 User-Agent 和特定已知 User-Agent。出于礼貌和稳定性考虑，设置 5 req/s 的合理上限。

**User-Agent 设置**：`AlbumShelf/1.0.0 (https://github.com/user/album-shelf)`

## Risks / Trade-offs

- **[ncm-cli 收藏专辑 API 时间不确定]** → 下个版本会支持，但具体发布时间未知。缓解：Mock 实现确保项目其他部分可独立开发和验证，切换成本低（只需实现一个接口）。
- **[MusicBrainz 匹配准确性]** → 按名称搜索可能匹配到错误的专辑（特别是中文专辑或同名专辑）。缓解：第一版接受自动匹配结果，后续可加手动修正功能。
- **[MusicBrainz 认证凭据存储]** → 用户名/密码存储在本地配置中，需注意安全性。缓解：使用 Electron 的 safeStorage API 加密存储。
- **[better-sqlite3 原生编译]** → better-sqlite3 需要针对 Electron 版本重新编译原生模块。缓解：使用 electron-rebuild 或 @electron/rebuild。