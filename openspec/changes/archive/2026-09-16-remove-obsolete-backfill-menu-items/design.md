# 技术设计：移除三个已失效的数据维护菜单项

## 1. 现状：三层调用链

三个菜单项的实现结构完全同构，删除时需逐层剥离：

```
菜单项（main/index.ts）
  └─ webContents.send('menu:xxxFill')
       └─ 渲染层 onMenuXxx(cb)（preload/index.ts）
            └─ handleXxxFill()（App.vue）
                 └─ window.api.albumXxxStart()（preload）
                      └─ ipcMain.handle('album:xxxStart')（ipc-handlers.ts）
                           ├─ 防重入标志 xxxRunning
                           ├─ albumService.getAlbumsWithoutXxx()（album-service.ts）
                           └─ 进度事件 'album:xxxProgress' → App.vue 进度条
```

## 2. 删除清单

### 2.1 主进程

**[index.ts](../../../album-shelf/src/main/index.ts)** —— 数据菜单模板中删除三个菜单项（「补全缺失封面」「补全缺失发行日期」「回填艺术家 ID」，含其 `mainWindow.webContents.send(...)`）。删除后数据菜单首项「同步专辑列表」与分隔线相邻关系需顺带确认（不保留孤立分隔线）。

**[ipc-handlers.ts](../../../album-shelf/src/main/ipc-handlers.ts)**

| 删除对象 | 位置 | 说明 |
| --- | --- | --- |
| `coverFillRunning` 声明 | 顶部标志区 | 仅被封面补全使用 |
| `album:coverFillStatus` / `album:coverFillStart` | 批量补全缺失封面段 | 整段含注释 |
| `releaseDateFillRunning` 声明 | 顶部标志区 | 仅被发行日期回填使用 |
| `album:releaseDateFillStart` | 批量回填缺失发行日期段 | 整段含注释 |
| `artistIdFillRunning` 声明 | 顶部标志区 | 仅被艺术家 ID 回填使用 |
| `album:artistIdFillStatus` / `album:artistIdFillStart` | 艺术家 ID 批量回填段 | 整段含注释；其中两处 `followedArtistService.fillMissingIdsFromAlbums()` 调用一并消失 |

**[album-service.ts](../../../album-shelf/src/main/album-service.ts)** —— 删除 `getAlbumsWithoutCover()`、`getAlbumsWithoutReleaseDate()`、`getAlbumsWithoutArtists()`。三者的唯一调用方是上面的 handler（已用 grep 确认）。

**[followed-artist-service.ts](../../../album-shelf/src/main/followed-artist-service.ts)** —— 删除 `fillMissingIdsFromAlbums()`（43 行附近的方法体）。删除理由：

- 唯一调用点是艺术家 ID 回填的收尾（含登录失效中止的提前返回分支）；
- 库内 `followed_artist.original_id IS NULL` 为 **0 条**；
- 关注时的写入路径已带 ID，已存在记录缺失 ID 时由 `COALESCE` 补齐 —— 该方法要解决的「老库专辑回填前关注、ID 为 NULL」场景已不存在。

### 2.2 预加载

**[preload/index.ts](../../../album-shelf/src/preload/index.ts) / [index.d.ts](../../../album-shelf/src/preload/index.d.ts)** —— 删除以下 API 与其类型：

- `albumCoverFillStatus`、`albumCoverFillStart`、`onCoverFillProgress`
- `albumReleaseDateFillStart`、`onReleaseDateFillProgress`
- `albumArtistIdFillStatus`、`albumArtistIdFillStart`、`onArtistIdFillProgress`
- 菜单事件订阅：`onMenuCoverFill`、`onMenuReleaseDateFill`、`onMenuArtistIdFill`

### 2.3 渲染层（App.vue）

- 模板：三条 `.enrich-bar` 进度条（封面 / 发行日期 / 艺术家 ID）
- 脚本：`coverFillProgress` / `releaseDateFillProgress` / `artistIdFillProgress` 三个 ref
- 脚本：`handleCoverFill` / `handleReleaseDateFill` / `handleArtistIdFill` 三个处理函数
- 脚本：`setupCoverFillProgressListener` / `setupReleaseDateFillProgressListener` / `setupArtistIdFillProgressListener` 三个进度监听注册
- 脚本：`onMounted` 中三段菜单事件监听注册；`onUnmounted` 中对应的清理调用与相关 `let removeXxxListener` 变量

> 复用样式（`.enrich-bar` / `.enrich-progress-track` 等）继续被同步进度条、补全进度条、风格库同步进度条使用，**不删样式**。

## 3. 保留清单（易误删）

| 对象 | 保留原因 |
| --- | --- |
| `publishTimeToReleaseDate` | 全量同步映射、搜索添加、单张重新同步、关注艺术家新片动态共 4 处仍在消费 |
| `ncm-cli-service.getAlbumDetail` | 搜索添加、单张重新同步、专辑详情、播放等链路 |
| `authService.triggerLoginPopup` / `handleLoginRequiredError` | 播放、关注、艺术家新片等链路 |
| `album:resync`（单张重新同步） | 渲染层零调用的死 IPC，但属另案，本次不动 |
| `enrich*` 系列（含 `getAlbumsWithoutMbData`） | 「补全缺失MB数据的专辑」仍在使用 |
| `genreLibrarySync*` 全链路 | 用户明确要求保留 |

## 4. 验证方式（用户手动 `npm run dev`）

1. **菜单检查**：数据菜单只剩「同步专辑列表 / 同步 MusicBrainz 风格库 / 补全缺失MB数据的专辑 / 重新补全所有专辑 / 导出数据 / 导入数据」，无孤立分隔线。
2. **核心链路回归**：
   - 同步专辑列表（含进度条与完成提示）；
   - 同步 MusicBrainz 风格库（进度条 + 完成提示）；
   - 补全缺失MB数据的专辑（进度条 + 模糊匹配弹窗队列）；
   - 导出 / 导入数据。
3. **关注功能**：专辑详情关注/取关艺术家、工具栏「★ 已关注」筛选、工具菜单「关注列表」窗口打开与实时同步正常。
4. **封面与日期**：任一专辑封面正常显示（含清空 `covers/` 目录后的自动重新下载）、详情面板发行日期正常。
5. **渲染层无残留调用**：应用启动后控制台不出现 `window.api.albumCoverFillStart is not a function` 一类错误（残留调用会在启动或点击时立刻暴露）。

## 5. 归档动作

- 更新 spec：删除 `data-sync` 的两条回填 requirement（并修正「存量惰性回填」场景中的菜单引用）、删除 `album-detail-expand` 的「批量补全缺失封面」requirement、删除 `artist-follow` 的「回填完成后补齐关注记录 ID」场景。
- README：从「数据维护」条目中移除三项描述；同步/补全相关描述保持不变。
- change 归档至 `openspec/changes/archive/`。
