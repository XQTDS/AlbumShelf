# 技术方案

## 1. 数据查询

### 1.1 统计口径

- 以**专辑**为计数单位：一张专辑的主艺人有一个地区时计入该地区，最多计入一个地区（与风格的一对多不同）。
- 地区通过 `album.primary_artist_id = artist.netease_artist_id` 派生；自动补全与手动设置的地区同等对待。
- 只统计「至少关联一张专辑」的地区，与工具栏筛选候选一致，避免列出空结果。
- 无地区（未补全、MB 无数据、群星/合辑）的专辑不进入 `stats`，只体现在 `totalAlbums - albumsWithRegion`。

### 1.2 `ArtistService.getRegionStats()`

在 `artist-service.ts` 中新增：

```ts
export interface RegionStats {
  stats: RegionOption[]
  totalAlbums: number
  albumsWithRegion: number
}
```

实现复用 `getUsedRegions()`（已按 `count DESC, region ASC` 排序并生成中文 label），再补两个计数查询：

```sql
SELECT COUNT(*) AS totalAlbums FROM album;

SELECT COUNT(DISTINCT a.id) AS albumsWithRegion
FROM album a
INNER JOIN artist ar ON ar.netease_artist_id = a.primary_artist_id
WHERE ar.region IS NOT NULL;
```

说明：

- `COUNT(DISTINCT)` 防御同一网易云艺人 ID 在 `artist` 表出现多行（当前按 `netease_artist_id` 唯一，但统计不依赖该约束）。
- 不新增派生表、不落库统计结果；数据规模为千级专辑 / 几十个地区，查询开销可忽略。

## 2. IPC 与 preload

- `ipc-handlers.ts` 新增：

```ts
ipcMain.handle('region:stats', async () => {
  try {
    return { success: true, data: artistService.getRegionStats() }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})
```

- `preload/index.ts` 新增 `regionStats: () => ipcRenderer.invoke('region:stats')`。
- `preload/index.d.ts` 增加：

```ts
regionStats: () => Promise<IpcResult<{
  stats: RegionOption[]
  totalAlbums: number
  albumsWithRegion: number
}>>
```

- 菜单事件：preload 新增 `onMenuRegionStats(callback)`，监听 `menu:regionStats`，返回取消订阅函数。
- `main/index.ts` 的「工具」子菜单在「风格统计」之后新增「地区统计」，点击发送 `menu:regionStats` 给主窗口。

## 3. 弹窗 UI

新增 `src/renderer/src/RegionStatsModal.vue`，结构与 `GenreStatsModal.vue` 一致，独立 scoped 样式：

- 标题：`🗺️ 地区统计`。
- 打开时（`visible` 变为 true）调用 `window.api.regionStats()` 加载，带 loading 态。
- 汇总卡：`收藏总数`、`有地区标签`、`地区数量`。
- 说明文案：`地区取自专辑主艺人，每张专辑最多计入一个地区；未标注地区的专辑不参与统计`。
- 条形图：展示 `stats` 全部条目，宽度按最大值比例缩放；label 显示 `item.label`，点击行发出 `selectRegion(item.key)`，`title` 为「点击筛选「{label}」」。
- 空状态：`暂无地区数据，请先补全 MusicBrainz 信息，或在「艺人信息」中手动设置地区`。
- 关闭：右上角按钮或遮罩点击。

展示全部地区（实测库中 49 个），沿用弹窗 `max-height: 85vh` 的滚动；不做 Top N / 「其他」聚合。

## 4. 主界面接线

`App.vue`：

- import `RegionStatsModal`，新增 `showRegionStatsModal` 与 `removeMenuRegionStatsListener`。
- 模板在 `GenreStatsModal` 后挂载：

```html
<RegionStatsModal
  :visible="showRegionStatsModal"
  @close="showRegionStatsModal = false"
  @select-region="handleSelectRegionFromStats"
/>
```

- `onMounted` 注册 `onMenuRegionStats`，`onUnmounted` 清理。
- Esc 关闭详情抽屉的屏蔽列表加入 `showRegionStatsModal.value`。
- 选择处理（地区为单选，直接替换而非追加）：

```ts
function handleSelectRegionFromStats(region: string) {
  selectedRegion.value = region
  resetAndFetch()
}
```

- 选择后弹窗自行关闭（与风格统计一致），列表按新地区筛选重载。

## 5. 边界与规则

| 场景 | 规则 |
|---|---|
| 无任何有地区的专辑 | `stats: []`，弹窗显示空状态；`totalAlbums` 仍返回真实收藏数 |
| 地区由手动设置 | 与 MB 自动地区同等计入统计 |
| 同一地区多个艺人 | 按专辑去重计数，不按艺人数 |
| 群星/合辑/无 MB 匹配 | 无地区，不进入 stats |
| 点击当前已选地区 | 保持筛选不重复，弹窗关闭并重载 |
| 统计打开期间库发生变化 | 每次打开重新请求；不做实时推送 |
| 地区 label 无法映射 | `regionLabel()` 回退原始代码，统计仍可用原始 key 筛选 |

## 6. 受影响 Spec

- **新增** `openspec/specs/region-stats/spec.md`：统计查询、弹窗展示、点击筛选。
- 修改 `openspec/specs/album-list-ui/spec.md`：按地区筛选新增「从地区统计弹窗选择地区」场景。
- 修改 `openspec/specs/genre-stats/spec.md`：与实际实现对齐——展示全部风格、菜单入口、条目可点击触发筛选。
- README：功能列表「筛选」「地区标签」与工具菜单说明。

## 7. 验证

按项目约定不自动跑 typecheck，由用户执行 `npm run dev` 验证：

1. 菜单「工具 → 地区统计」能打开弹窗并展示全部地区，数量与工具栏地区筛选候选一致。
2. 汇总卡：`有地区标签` 等于各条形数量之和；`收藏总数` 与列表总数一致。
3. 点击任一地区 → 弹窗关闭，工具栏地区下拉同步显示该地区，列表只剩该地区专辑。
4. 清空地区筛选后列表恢复；与其他筛选（艺术家/风格/搜索）组合正常。
5. 在「艺人信息」中手动修改某艺人地区后，重新打开地区统计能反映新分布。
6. 空库或全部无地区时显示空状态。
