## Context

AlbumShelf 项目通过 `netease_album_id`（网易云加密专辑 ID）作为与外部数据交互的核心标识。当前系统通过 CSV 导入 + 搜索匹配获得该 ID，但部分 ID 错误导致曲目同步、封面获取返回错误数据。系统已有 `ncm-cli` 封装（`NcmCliService`）支持 `getAlbumDetail()` 和 `searchAlbum()` 调用，以及 `FuzzyMatchModal` 组件提供逐条用户确认交互的先例。

## Goals / Non-Goals

**Goals:**
- 提供一键批量校验所有专辑 `netease_album_id` 正确性的能力
- 对不匹配的专辑自动搜索候选，用户逐个手动确认后修复
- 修复后自动重新同步曲目、封面并回写 CSV
- 校验过程有进度反馈

**Non-Goals:**
- 不做自动修复（必须用户确认）
- 不处理完全没有 `netease_album_id` 的专辑（那些需要用现有搜索功能手动添加）
- 不修改 MusicBrainz 补全逻辑（修复 ID 后可手动触发 resync）

## Decisions

### Decision 1: 校验匹配策略

**决定**：使用 `title.trim().toLowerCase() === remoteAlbumName.trim().toLowerCase()` 进行精确匹配。不匹配的全部呈现给用户确认。

**理由**：简单可靠。模糊匹配会引入误判（把本来正确的标记为不匹配或反之），用户数据量可控（数百张专辑），人工确认是最终可靠保障。

**替代方案**：Levenshtein 相似度阈值（复杂度高，可能误判中英混合名）。

### Decision 2: 逐个确认交互模式（IPC 回调）

**决定**：校验完成后，后端返回完整 mismatch 列表给前端。前端弹出 `IdVerifyModal`，逐条展示不匹配信息 + 搜索候选。用户选择后通过 `album:fixId` IPC 逐条提交修复。

**理由**：复用现有 `FuzzyMatchModal` 的 UX 模式（用户已熟悉），且解耦了校验和修复两个步骤——用户可以选择性跳过某些专辑。

**替代方案**：使用 IPC event 逐条推送（类似 streaming），但前端状态管理复杂度高，不如一次性返回列表直观。

### Decision 3: API 限流策略

**决定**：校验时每次 `getAlbumDetail()` 调用间隔 300ms。搜索候选时由用户触发（点击某个 mismatch 条目时发起搜索），不需要额外限流。

**理由**：ncm-cli 底层调用网易云 API，过于频繁会触发限流。300ms 间隔对数百张专辑的校验在 2-3 分钟内完成，可接受。

### Decision 4: 数据库更新方式

**决定**：在 `AlbumService` 新增 `updateNeteaseAlbumId(id, newNeteaseAlbumId, newOriginalId)` 方法，直接 UPDATE 该专辑行的 `netease_album_id` 和 `netease_original_id` 字段。由于 `netease_album_id` 有 UNIQUE 约束，更新前需检查新 ID 不与其他专辑冲突。

**理由**：现有 `AlbumUpdate` 接口刻意不包含 `netease_album_id`（因为它是业务主键），修复场景是特殊操作，用独立方法更安全。

### Decision 5: 修复后重新同步

**决定**：修复 `netease_album_id` 后，立即清除旧曲目并重新拉取、重新获取封面。不自动触发 MusicBrainz 补全（用户可后续手动 resync）。

**理由**：曲目和封面直接依赖 `netease_album_id`，必须同步更新。MB 补全耗时长且已有单独入口，不阻塞修复流程。

### Decision 6: 进度反馈

**决定**：校验过程通过 IPC event（`album:verifyProgress`）实时推送进度（当前序号 / 总数），前端展示进度条。

**理由**：校验可能需要几分钟，无进度反馈体验差。使用 event push 而非 polling，简单高效。

## Risks / Trade-offs

- **[大量 API 调用]** → 数百张专辑逐个调用 getAlbumDetail，耗时 2-3 分钟。通过进度条缓解用户等待焦虑。
- **[ncm-cli 调用失败]** → 单条失败不中断整个校验流程，记录失败条目，在结果中标注"校验失败"供用户知晓。
- **[UNIQUE 约束冲突]** → 修复时新 ID 可能已被另一条专辑占用。此时提示用户冲突信息，跳过该条。
- **[CSV 回写定位]** → 需要按 title + artist 在 CSV 中定位行来更新 netease_id，若 CSV 中有重复行可能误更新。通过匹配第一条 + 日志告知用户。
