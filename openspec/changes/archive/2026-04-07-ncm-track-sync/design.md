## Context

AlbumShelf 已具备完整的专辑同步、展示和详情展开功能。track 表结构就绪（含 `netease_song_id`、`netease_original_id`、`title`、`artist`、`track_number`、`disc_number`、`duration_ms`），前端曲目列表 UI 已实现但因 track 表为空始终显示"暂无曲目信息"。

ncm-cli 是系统中全局安装的命令行工具，已确认支持 `album tracks --albumId <加密ID> --output json` 命令。返回数据包含每首曲目的 `id`（加密 ID）、`originalId`（原始数字 ID）、`name`、`duration`（毫秒）、`artists` 数组。返回的曲目按专辑内顺序排列（数组索引即曲目序号），但不包含 `track_number` 和 `disc_number` 字段。

当前项目中通过子进程调用外部命令行工具的模式尚未建立。

## Goals / Non-Goals

**Goals:**
- 建立 ncm-cli 命令行调用的通用封装，为后续接入更多 ncm-cli 命令（如收藏专辑列表）奠定基础
- 实现按专辑 ID 从网易云拉取曲目并写入 track 表的能力
- 前端展开详情时自动补全曲目数据（本地为空 → 远程拉取 → 写入 → 返回）
- 同时存储曲目的加密 ID 和原始数字 ID

**Non-Goals:**
- 不实现批量曲目同步（一次性同步所有专辑的曲目）
- 不处理 ncm-cli 未登录的情况（假定已登录）
- 不处理 disc_number 的精确推断（ncm-cli 不返回该字段，统一设为 1）
- 不实现曲目增量更新（每次同步都是全量替换）

## Decisions

### 1. NcmCliService：通用命令行封装

**决定**：创建 `src/main/ncm-cli-service.ts`，使用 `child_process.execFile` 调用 `ncm-cli`，固定 `--output json` 参数，解析返回的 JSON。提供泛型方法 `execute<T>(args: string[]): Promise<T>`。

**理由**：
- `execFile` 比 `exec` 更安全（不经过 shell 解释），且参数无需转义
- 统一封装便于未来接入更多 ncm-cli 命令（收藏列表、搜索等）
- 泛型返回值让调用方有类型安全

**备选方案**：直接在各服务中内联调用 `exec` —— 会导致重复代码和不一致的错误处理。

### 2. 曲目同步策略：按需拉取 + 全量替换

**决定**：
- 不在专辑同步时批量拉取曲目。而是在 `track:listByAlbum` IPC 被调用时，检查该专辑的 track 表是否为空，为空则自动从 ncm-cli 拉取并写入
- 每次拉取都是全量替换（先删后插），保证数据一致性
- 另提供 `track:syncByAlbum` IPC 供前端主动触发重新同步

**理由**：
- 按需拉取避免初始同步时大量 ncm-cli 调用（15 张专辑 = 15 次网络请求），减少等待时间
- 用户展开哪张专辑才请求哪张，体验更好
- 全量替换逻辑简单，避免增量对比的复杂性

**备选方案**：专辑同步时立即拉取所有曲目 —— 初始加载时间过长，且大部分曲目可能不会被查看。

### 3. track_number 推断

**决定**：ncm-cli 返回的曲目数组按专辑内顺序排列，使用 `数组索引 + 1` 作为 `track_number`。`disc_number` 统一设为 1。

**理由**：ncm-cli 不返回 track_number 和 disc_number 字段，但实测返回顺序与专辑曲目顺序一致。对于多碟专辑，曲目编号可能不精确，但满足当前展示需求。

### 4. 修改 track:listByAlbum 为"自动补全"模式

**决定**：修改现有的 `track:listByAlbum` IPC handler，增加逻辑：查询 track 表 → 为空且专辑有 `netease_album_id` → 调用 ncm-cli 拉取 → 写入 → 返回。对前端透明，无需修改前端加载逻辑。

**理由**：前端已有 `trackCache` 和 `watch(expandedAlbumId)` 的懒加载机制，只需后端自动补全即可，前端零改动。

### 5. artist 字段处理

**决定**：ncm-cli 返回的 `artists` 是数组，取所有 artist 的 `name` 用 `" / "` 连接存入 track 表的 `artist` TEXT 字段。

**理由**：track 表 artist 是 TEXT 字段，合唱曲目需要展示所有艺术家。用 `" / "` 分隔是音乐软件的惯例。

## Risks / Trade-offs

- **[ncm-cli 未安装或不在 PATH]** → `execFile` 调用失败，catch 错误返回空曲目列表，前端显示"暂无曲目信息"，不影响正常使用
- **[ncm-cli 未登录]** → API 可能返回错误，同上处理
- **[网络超时]** → 设置 execFile 超时 15 秒，超时按错误处理
- **[多碟专辑 disc_number 不准确]** → 统一设为 1，所有曲目按顺序平铺展示。后续可通过 MusicBrainz 补全 disc 信息
- **[Mock 数据中的 netease_album_id 是假 ID]** → 调用 ncm-cli 会返回参数错误，自动降级为空曲目列表