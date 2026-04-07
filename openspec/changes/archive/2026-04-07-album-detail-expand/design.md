## Context

当前 AlbumShelf 的专辑列表以表格形式呈现，每行显示一条专辑的摘要信息。风格标签只显示前 3 个，封面图、外部链接等信息完全不可见。用户需要一种轻量的方式在列表内查看完整的专辑详情。

现有 `album:list` IPC 返回的 Album 对象已包含 cover_url、netease_id、musicbrainz_id 等字段，后端无需修改。

## Goals / Non-Goals

**Goals:**
- 用户点击专辑行即可在行下方展开详情区域
- 详情区域展示：封面图、所有风格标签、MusicBrainz 链接、网易云链接、评分人数、曲目数、同步时间等
- 手风琴模式（accordion）：同一时间只展开一行，点击其他行自动收起当前行
- 展开/收起有平滑的过渡动画

**Non-Goals:**
- 不引入详情弹窗（modal）或独立的详情页面
- 不支持在详情区域编辑专辑信息
- 不修改后端 IPC 接口或数据库结构

## Decisions

### 1. 纯前端实现，不修改 IPC 接口

**决定**：所有改动仅在 `App.vue` 渲染层完成。

**理由**：`album:list` 返回的 Album 类型已包含展示所需的全部字段（cover_url、netease_id、musicbrainz_id、mb_rating_count、track_count、synced_at、enriched_at、genres），无需新增 IPC 调用或修改数据结构。

### 2. 手风琴模式 + 行内展开

**决定**：使用 `expandedAlbumId` 状态变量控制当前展开的行，点击行切换展开/收起。

**理由**：手风琴模式避免同时展开多行导致列表过长，保持表格可读性。状态管理简单，仅需一个 `ref<number | null>`。

### 3. 外部链接通过 shell.openExternal 打开

**决定**：MusicBrainz 和网易云链接通过 Electron 的 `shell.openExternal` 在系统默认浏览器中打开。

**理由**：安全且符合桌面应用惯例。当前 preload 已暴露 `window.electron.shell.openExternal`（来自 @electron-toolkit/preload）。

### 4. CSS transition 实现展开动画

**决定**：使用 CSS `max-height` + `overflow: hidden` + `transition` 实现平滑展开/收起动画。

**理由**：纯 CSS 方案性能好，不需要引入额外的动画库。`max-height` 方案对可变高度内容兼容性好。

## Risks / Trade-offs

- **[封面图加载失败]** → 使用占位符（专辑 emoji 或灰色背景）+ `onerror` fallback
- **[外部链接字段为空]** → musicbrainz_id 或 cover_url 为 null 时隐藏对应元素，不显示空链接
