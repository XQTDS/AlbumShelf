## Context

当前 `EnrichService` 中的匹配流程完全硬编码：`buildSearchQueries()` 构建 Q1/Q2/Q3 三个精确查询，`buildFuzzyQueries()` 构建 F1/F2/F3 三个模糊查询。查询中的 artist 字段只使用本地原名，无法处理同一艺术家的不同写法。

批量补全流程（`enrichAll()`）跑完所有专辑后，将模糊匹配结果存入 `_pendingMatches` 数组，前端在补全结束后统一弹出 `FuzzyMatchModal` 让用户批量确认。主进程与渲染进程通过 `enrich:confirmMatch` / `enrich:rejectMatch` IPC handle 交互。

项目没有通用的设置管理机制，凭据管理通过 `credentials.ts` 使用 Electron safeStorage API 单独处理。

## Goals / Non-Goals

**Goals:**
- 新增 `artist-aliases.json` 文件，支持手动维护和运行时自动学习艺术家别名
- 将别名嵌入 `buildSearchQueries()` 和 `buildFuzzyQueries()` 中，按 B-2 优先级（同策略内先原名后别名）扩展查询
- 新增 `settings.json` 文件管理，支持 6 个匹配策略独立开关（默认全开）
- 将批量补全从"全部跑完后统一确认"改为"逐条弹窗确认"，使别名学习可即时生效
- 确认模糊匹配时，若 MB 艺术家名与本地不同，自动追加到别名文件

**Non-Goals:**
- 不在本次变更中实现策略开关的前端 UI（后续迭代）
- 不实现别名的手动编辑 UI（直接编辑 JSON 文件）
- 不处理反向别名（即"王菲→王靖雯"不自动反推出"王靖雯→王菲"）
- 不处理打包后的 asar 路径问题（当前为开发阶段，后续打包时再处理 extraResources）

## Decisions

### D1: 别名文件位置与读写

**决定**：`artist-aliases.json` 放在代码仓库 `album-shelf/src/main/enrich/` 目录下，运行时直接读写该文件。

**理由**：用户希望长期手动维护别名，跟随代码仓库便于版本控制。自动学习的别名也写入同一文件，避免两份文件合并的复杂性。

**替代方案**：
- 两份文件（仓库内手动 + userData 自动）→ 增加合并逻辑和去重复杂度，放弃
- 仅 userData → 无法跟随代码仓库版本控制，放弃

### D2: 别名数据结构

**决定**：JSON 对象，key 为本地艺术家名，value 为别名数组。

```json
{
  "王菲": ["王靖雯"],
  "陶喆": ["David Tao"]
}
```

**运行时**：启动时加载为 `Map<string, string[]>`，提供 `getAliases(artist)` 查找和 `addAlias(artist, alias)` 追加方法。`addAlias` 内部去重，写入后同步到文件。

### D3: 查询构建中别名的嵌入方式（B-2 优先级）

**决定**：同策略内先原名后别名。对每个启用的策略，先用原名生成查询，再依次用每个别名生成查询。

```
Q1(原名) → Q1(别名1) → Q1(别名2) →
Q2(原名) → Q2(别名1) → Q2(别名2) →
Q3(原名) → Q3(别名1) → Q3(别名2)
```

**实现**：`buildSearchQueries(title, artist)` 和 `buildFuzzyQueries(title, artist)` 内部调用 `getAliases(artist)` 获取别名列表，在每个策略的查询生成逻辑中循环 `[artist, ...aliases]`。策略开关通过读取 settings 决定是否跳过。

**替代方案**：
- B-1（原名所有策略优先）→ 用户选择了 B-2，放弃

### D4: 策略开关存储

**决定**：使用 `userData/settings.json` 存储，不依赖数据库。文件不存在时使用默认值（全部开启）。

```json
{
  "enrichStrategies": {
    "Q1_fullTitleFullArtist": true,
    "Q2_fullTitleFirstArtist": true,
    "Q3_titleFirstWordFirstArtist": true,
    "F1_removeArtistPrefix": true,
    "F2_removeParenSuffix": true,
    "F3_luceneTokenSearch": true
  }
}
```

**理由**：JSON 文件与 `credentials.json` 风格一致，且 `settings.json` 文件名通用，后续可添加其他设置项。

**实现**：新增 `settings.ts` 模块，提供 `loadSettings()` / `saveSettings()` / `getEnrichStrategies()` 方法。settings 的 key 采用 top-level namespace 设计（如 `enrichStrategies`），方便未来扩展。

### D5: 逐条确认的 IPC 通信模式

**决定**：在 `enrichAlbum()` 内部，当模糊匹配产生候选时，通过回调函数通知调用方（`enrichAll`），由 `enrichAll` 的调用者（IPC handler）负责与前端通信并等待回复。

**架构**：

```
enrichAll(onProgress, onFuzzyMatch)
  │
  ├─ enrichAlbum(album)
  │   ├─ matchAlbum() → 成功 → 返回 'matched'
  │   └─ fuzzyMatchAlbum() → 有候选 →
  │       调用 onFuzzyMatch(album, candidates)
  │       └─ 返回 Promise<{mbid: string} | null>
  │           ├─ mbid → confirmMatch() + 别名学习 → 返回 'matched'
  │           └─ null → rejectMatch() → 返回 'failed'
```

**IPC handler 层**：

```typescript
// ipc-handlers.ts 中
const result = await enrichService.enrichAll(
  (progress) => mainWindow.webContents.send('enrich:progress', progress),
  async (album, candidates) => {
    // 发送候选到前端
    mainWindow.webContents.send('enrich:fuzzy-confirm-request', {
      albumId: album.id, albumTitle: album.title,
      albumArtist: album.artist, candidates
    })
    // 等待前端回复
    return new Promise((resolve) => {
      ipcMain.handleOnce('enrich:fuzzy-confirm-reply', (_e, reply) => {
        resolve(reply)  // { mbid: string } | null
      })
    })
  }
)
```

**前端**：`FuzzyMatchModal.vue` 改为监听 `enrich:fuzzy-confirm-request` 事件，弹出单条确认弹窗，用户选择后通过 `invoke('enrich:fuzzy-confirm-reply', ...)` 回传结果。

**重要变化**：
- 移除 `_pendingMatches` 数组及 `getPendingMatches()` 方法
- 移除 `enrich:confirmMatch` 和 `enrich:rejectMatch` IPC handle
- 移除 `enrich:getPendingMatches` IPC handle
- `EnrichResult` 中 `pending` 字段不再需要（所有 fuzzy 在过程中已确认或拒绝）
- `enrichAlbum()` 返回值改为 `'matched' | 'failed'`（不再有 `'fuzzy'`）

**替代方案**：
- 分段式（遇到 fuzzy 就停止 enrichAll，用户确认后手动继续）→ 交互割裂，放弃

### D6: 自动别名学习逻辑

**决定**：在 `enrichAlbum()` 中处理 onFuzzyMatch 回调的返回值后，比较本地 artist 与 MB artist（从候选的 `mbArtist` 字段获取）。若不同，调用 `addAlias(localArtist, mbArtist)` 追加别名。

**比较逻辑**：忽略大小写和首尾空格后进行比较。若本地 artist 包含多个艺术家（空格分隔），取第一个与 MB artist 比较。

**去重**：`addAlias()` 内部检查别名是否已存在，避免重复写入。

### D7: 新增模块划分

| 新模块 | 文件 | 职责 |
|--------|------|------|
| ArtistAliasManager | `album-shelf/src/main/enrich/artist-alias.ts` | 加载/查找/追加别名，读写 `artist-aliases.json` |
| SettingsManager | `album-shelf/src/main/enrich/settings.ts` | 加载/保存设置，提供 `getEnrichStrategies()` |

`EnrichService` 在构造时注入 `ArtistAliasManager` 和 `SettingsManager`（或在方法内调用其全局单例），保持松耦合。

## Risks / Trade-offs

**[API 调用量增加]** → 每个别名在每个策略中额外产生一次查询。但 break-on-first-match 逻辑限制了实际增加量，只在匹配失败时才会尝试更多查询。MusicBrainz 1 req/s 限制下，每个额外查询增加约 1 秒延迟。

**[别名文件写冲突]** → 开发阶段直接写源码目录下的文件，多实例运行时可能冲突。 → 当前为单用户桌面应用，不存在并发问题，暂不处理。

**[逐条确认用户体验]** → 大量模糊匹配时用户需要频繁确认，可能感到繁琐。 → 别名学习机制会逐步减少后续的模糊匹配数量，长期体验会改善。

**[handleOnce 注册时序]** → `ipcMain.handleOnce` 需要确保在前端 invoke 之前注册。由于主进程先 send 再 handleOnce，而前端收到 send 后才 invoke，时序上是安全的。但需注意 handleOnce 用于 handle channel 时不能与已有的 handle 冲突——建议使用动态 channel 名（如 `enrich:fuzzy-confirm-reply:${albumId}`）或改用 `ipcMain.once`（监听 send 而非 invoke）来避免问题。

## Open Questions

- 逐条确认弹窗的 UI 细节（是否复用现有 FuzzyMatchModal 还是新建组件？）→ 倾向复用并改造
- 打包后 `artist-aliases.json` 的路径处理方案 → 留到打包阶段解决