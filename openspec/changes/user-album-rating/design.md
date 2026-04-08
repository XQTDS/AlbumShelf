## Context

当前 AlbumShelf 应用使用 better-sqlite3 存储专辑数据，通过 MusicBrainz API 补全社区评分（`mb_rating`）。UI 以表格形式展示专辑列表，支持展开详情查看封面、风格、曲目等。评分列目前仅显示 MB 评分。

本次变更需新增用户个人评分维度，与 MB 社区评分并行展示，评分通过交互式星级组件完成。

## Goals / Non-Goals

**Goals:**
- 在 album 表新增 `user_rating` 字段，支持持久化用户评分
- 列表行同时展示用户评分和 MB 评分两列
- 详情展开区提供可交互的半星评分组件
- 支持按用户评分排序
- 支持修改和清除评分

**Non-Goals:**
- 不支持多用户/多账号评分（本地单用户应用）
- 不做评分统计/汇总功能（如平均分、分布图）
- 不做评论/文字评价功能

## Decisions

### Decision 1: 评分存储方式 — album 表直接加列

直接在 album 表新增 `user_rating REAL` 列，而非单独建评分表。

**理由**: 单用户场景，每张专辑只有一个评分，无需额外关联表。SQLite ALTER TABLE ADD COLUMN 简单可靠，与现有 migration 模式一致。

**替代方案**: 新建 `user_rating` 表 (album_id, rating, rated_at) — 过度设计，增加无必要的 JOIN 复杂度。

### Decision 2: 评分 IPC 接口 — 单独的 `album:setRating` handler

新建专用 IPC handler `album:setRating(albumId, rating)` 而非复用 `album:update`。

**理由**: 语义清晰，可在 handler 层做评分值校验（范围、步长），避免暴露通用更新接口。

### Decision 3: 评分组件交互 — 仅在展开详情区可评分

列表行显示只读评分（星星 + 数字），可交互的评分组件放在展开详情区。

**理由**: 列表行空间有限且交互密集（点击展开、播放按钮），在此添加可交互评分易误触。详情区空间充足，评分是低频操作，放在展开区更合理。

### Decision 4: 评分 UI — CSS 纯实现的星级组件

使用 CSS + SVG 星星图标实现评分组件，不引入第三方评分组件库。

**理由**: 项目当前无 UI 组件库依赖，半星评分逻辑简单（5 颗星各分左右两半，共 10 个点击区域），纯 CSS 实现可控且轻量。

### Decision 5: 评分保存方式 — 乐观更新，点击即保存

用户点击星星后立即发送 IPC 请求保存，同时乐观更新本地状态。无需确认按钮。

**理由**: 评分是轻量操作，即时反馈体验更好。失败时回退本地状态并提示。

## Risks / Trade-offs

- **[风险] SQLite migration 无法回滚 ALTER TABLE DROP COLUMN** → 影响极小，`user_rating` 是可空列，即使不用也不影响现有功能。SQLite 3.35+ 支持 DROP COLUMN，但无需依赖此特性。
- **[权衡] 列表列数增加** → 新增"我的评分"列后总共 7 列，可能在窄屏下略显拥挤。通过合理设置列宽缓解，用户评分列用紧凑的星星图标展示。
- **[权衡] 排序字段扩展** → `sortBy` 类型从联合类型新增 `'user_rating'`，需要同步更新 preload 类型声明和前端类型。变更面可控。
