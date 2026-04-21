## Context

AlbumShelf 通过 MusicBrainz API 为专辑补全评分和风格标签。当前的匹配策略使用 Lucene 短语精确匹配（`releasegroup:"标题"`），并配有 3 级降级策略（多艺术家、标题首词）。当本地标题与 MB 标题存在差异时（如包含艺术家名前缀、Deluxe Edition 后缀等），所有策略都会失败。

现有系统特征：
- 批量补全完全自动化，无用户交互
- `enrichAlbum()` 中匹配失败仍标记 `enriched_at`，避免重复尝试
- API 频率限制 1 req/s
- 前端已有 `FuzzyMatchModal.vue`（用于同步流程的模糊匹配确认），可复用其 UI 模式

## Goals / Non-Goals

**Goals:**
- 在精确匹配失败时，通过模糊查询策略提高匹配覆盖率
- 模糊匹配结果需要用户确认后才应用，保证数据准确性
- 批量补全流程不被打断：模糊匹配结果在批量完成后统一展示
- 最小化对现有匹配逻辑的侵入

**Non-Goals:**
- 不实现实时逐个确认（打断批量流程）
- 不实现 F4 策略（仅用 artist 搜索 + 本地相似度比较），噪音太大
- 不持久化待确认数据到数据库，内存暂存即可
- 不改变精确匹配成功时的自动应用行为

## Decisions

### Decision 1: 模糊查询策略的实现方式

**选择**: 在 `EnrichService` 中新增 `buildFuzzyQueries(title, artist)` 方法，返回最多 3 个模糊查询语句，按优先级依次尝试。

**三个子策略**:

- **F1 — 去除艺术家名前缀**: 使用正则 `new RegExp('^' + escapeRegex(artist) + "[''']?s?[\\s\\-–—:]*", 'i')` 检测标题是否以艺术家名开头，去除后用剩余部分作为标题搜索。例如 `"Tim Berne's Fractured Fairy Tales"` → `"Fractured Fairy Tales"`。

- **F2 — 去除括号后缀**: 使用正则 `/\s*[\(（\[].+?[\)）\]]\s*$/` 去除标题末尾的括号内容。例如 `"OK Computer (Deluxe Edition)"` → `"OK Computer"`。

- **F3 — Lucene 分词搜索**: 去掉 `releasegroup:` 后面的引号，改为 `releasegroup:Fractured Fairy Tales AND artist:"Tim Berne"`。Lucene 会按各词分别匹配而非短语精确匹配，覆盖面更广。

**替代方案**: 考虑过使用字符串相似度算法（Levenshtein/Jaccard）在客户端做二次过滤，但 MusicBrainz API 已经返回 score，额外的相似度计算增加复杂度但收益有限。

**理由**: 三个策略分别针对最常见的标题差异模式，按精确度递减排列，找到结果即停止，平衡了覆盖率和查询开销。

### Decision 2: 模糊匹配结果的数据流

**选择**: 拆分 `matchAlbum()` 为两阶段 — 搜索阶段和应用阶段。

```
matchAlbum(title, artist, releaseDate)
  ├── 精确匹配成功 → 返回 MbMatchResult（含 rating/genres，可直接应用）
  ├── 精确匹配失败 → fuzzyMatchAlbum(title, artist, releaseDate)
  │     └── 模糊匹配成功 → 返回 MbFuzzyCandidate（仅含搜索信息，不含 rating/genres）
  │     └── 模糊匹配失败 → null
  └── 完全失败 → null
```

新增 `fuzzyMatchAlbum()` 方法：
- 调用 `buildFuzzyQueries()` 构建模糊查询
- 找到最佳候选后，**不立即调用 lookup() 获取 rating/genres**
- 返回 `MbFuzzyCandidate`（含 mbid、mbTitle、mbArtist、score、releaseDate）
- lookup 调用推迟到用户确认后执行

**理由**: 避免为可能被用户拒绝的候选浪费 API 调用。

### Decision 3: 待确认列表的管理

**选择**: 在 `EnrichService` 实例上维护一个 `pendingMatches: PendingMatch[]` 数组。

```typescript
interface PendingMatch {
  albumId: number           // 本地专辑 ID
  albumTitle: string        // 本地标题
  albumArtist: string       // 本地艺术家
  mbid: string              // 候选的 MB Release Group ID
  mbTitle: string           // MB 上的标题
  mbArtist: string          // MB 上的艺术家信用
  score: number             // 匹配分数
  releaseDate: string|null  // MB 首发日期
}
```

**生命周期**:
- `enrichAll()` 开始时清空 `pendingMatches`
- 每个模糊匹配成功的专辑追加到 `pendingMatches`
- 模糊匹配的专辑**不标记 `enriched_at`**，以便用户拒绝后下次仍可尝试
- `enrichAll()` 返回值扩展为 `{ matched, failed, pending, total }`
- 用户确认后调用新的 `confirmMatch(albumId, mbid)` → 执行 lookup + 写入数据库 + 标记 `enriched_at`
- 用户跳过后调用新的 `rejectMatch(albumId)` → 仅标记 `enriched_at`

**替代方案**: 考虑过使用数据库的新表 `pending_match` 持久化，但增加了迁移和清理复杂度，且补全完成后用户通常立即审核。

### Decision 4: IPC 接口设计

**新增 IPC 通道**:

| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `enrich:confirmMatch` | renderer → main | `{ albumId: number, mbid: string }` | `{ success: boolean }` |
| `enrich:rejectMatch` | renderer → main | `{ albumId: number }` | `{ success: boolean }` |
| `enrich:getPendingMatches` | renderer → main | 无 | `PendingMatch[]` |

**修改现有通道**:
- `enrich:start` / `enrich:reEnrichAll` / `enrich:enrichAlbumsWithoutGenres` 的返回值新增 `pending: number` 字段
- 前端在收到 `pending > 0` 时，调用 `getPendingMatches` 获取待确认列表，然后展示确认面板

### Decision 5: 前端交互设计

**选择**: 复用现有 `FuzzyMatchModal.vue` 的 UI 模式，但改造数据结构以适配 MusicBrainz 补全场景。

**改造要点**:
- `FuzzyMatch` 接口改为使用 `PendingMatch` 的字段（albumId、mbid 替代 neteaseId）
- 展示内容调整：显示本地标题 vs MB 标题的对比，显示 MB 艺术家信用和 score
- 确认操作改为调用 `enrichConfirmMatch`，跳过操作调用 `enrichRejectMatch`
- 保留全选/全不选功能
- 补全完成后自动弹出（当 pending > 0 时）

### Decision 6: enrichAll 中模糊匹配失败的专辑不标记 enriched_at

**选择**: 精确匹配失败 + 模糊匹配也无候选的专辑，仍标记 `enriched_at`（与当前行为一致）。模糊匹配有候选但等待用户确认的专辑，不标记 `enriched_at`。

**理由**: 如果用户拒绝了模糊匹配候选，下次补全时该专辑仍会出现，用户可以在条件改善后（如 MB 数据更新）重新尝试。用户确认或显式拒绝后才标记。

## Risks / Trade-offs

- **[API 调用量增加]** → 模糊查询最多 +3 次/专辑，但仅在精确匹配失败时触发。对于大多数专辑精确匹配就能成功，增量有限。受现有 1 req/s 频率限制保护。
- **[内存暂存可能丢失]** → 如果补全完成后用户关闭应用再重新打开，待确认列表会丢失。但这些专辑未标记 `enriched_at`，下次补全会重新处理。可接受。
- **[F1 正则可能过度匹配]** → 如果艺术家名恰好是标题的合法部分（罕见情况），F1 可能错误地截断标题。通过用户确认机制兜底。
- **[F3 分词搜索噪音]** → 去掉引号后 Lucene 分词匹配可能返回不相关结果。通过 score >= 50 过滤 + 用户确认双重保障。
