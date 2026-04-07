## 1. 展开/收起交互逻辑

- [x] 1.1 在 App.vue 中添加 `expandedAlbumId` 状态（ref<number | null>），实现 `toggleExpand(albumId)` 方法（手风琴模式：点击已展开行收起，点击其他行切换）
- [x] 1.2 为表格行绑定 `@click="toggleExpand(album.id)"`，添加 `cursor: pointer` 样式和展开行高亮样式

## 2. 详情区域模板

- [x] 2.1 在每个 `<tr>` 后插入详情行 `<tr class="detail-row">`，使用 `v-show` 控制显示，内部用 `<td colspan>` 包裹详情内容
- [x] 2.2 实现详情区域左侧：封面图展示（cover_url 存在时显示 `<img>`，为空时显示 emoji 占位符），添加 `onerror` fallback
- [x] 2.3 实现详情区域右侧上半部分：所有风格标签完整展示（复用 `.genre-tag` 样式，不截断）
- [x] 2.4 实现详情区域右侧中部：元数据信息行（评分人数、曲目数、同步时间、补全时间），缺失字段显示"—"或"未补全"
- [x] 2.5 实现详情区域右侧下部：MusicBrainz 链接（musicbrainz_id 非空时拼接 `https://musicbrainz.org/release-group/<id>` 显示）和网易云链接（拼接 `https://music.163.com/#/album?id=<netease_id>`），通过 `window.electron.shell.openExternal` 打开，链接点击时阻止事件冒泡

## 3. 动画与样式

- [x] 3.1 实现展开/收起的平滑过渡动画（CSS max-height + overflow: hidden + transition）
- [x] 3.2 实现详情区域的整体布局样式（左右分栏、封面图尺寸、间距、背景色等）