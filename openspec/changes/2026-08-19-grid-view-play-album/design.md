# 唱片墙播放整张专辑 技术设计

## 1. 现状盘点（`src/renderer/src/App.vue`）

- 播放链路完整可复用：`handlePlayAlbum(albumId)`（[App.vue:1232](../album-shelf/src/renderer/src/App.vue#L1232)）内部走 `window.api.playerPlayAlbum` → `loadTracks` → `beginPlaybackContext`，表格视图与唱片墙共用同一 `albums` 数据源，无需任何主进程改动。
- 卡片结构：`.album-card` 直接子元素为封面 img / 💿 占位、`.card-overlay`（悬停遮罩，`pointer-events: none`）、`.card-badge`（左下角排序角标，`bottom: 6px; left: 6px; z-index: 2`）。
- 表格按钮样式：`.btn-play`（圆形基类）+ `.btn-play-album`（28px、primary 底色、`hover scale(1.1)`），播放中显示 `.spinner.small`。

## 2. 模板改动（仅唱片墙卡片）

在 `.album-card` 内新增直接子元素（**不放进** `.card-overlay`，避免遮罩 `pointer-events: none` 影响点击；`position: absolute` 定位不受 DOM 位置限制）：

```html
<button
  class="btn-play btn-play-card"
  title="播放整张专辑"
  @click.stop="handlePlayAlbum(album.id)"
  :disabled="playingAlbumId === album.id"
>
  <span v-if="playingAlbumId === album.id" class="spinner small"></span>
  <span v-else>▶</span>
</button>
```

要点：

- `@click.stop`：点击播放不冒泡到卡片的 `toggleSelect`，不改变选中状态（与表格视图行为一致）。
- `:disabled` + spinner：复用 `playingAlbumId` 状态与表格按钮完全一致的防重入表现。

## 3. 样式设计

```css
.btn-play-card {
  position: absolute;
  right: 6px;
  bottom: 6px;
  z-index: 2;          /* 与 .card-badge 同级，浮于封面与遮罩之上 */
  opacity: 0;
  transition: opacity 0.15s;
  width: 28px;
  height: 28px;
  font-size: 11px;
  background: var(--primary);
  color: white;
}

.album-card:hover .btn-play-card,
.btn-play-card:disabled { opacity: 1; }   /* 播放中保持可见（spinner） */
```

- 悬停显隐：跟随 `.album-card:hover`，与遮罩同节奏淡入（0.15s，与既有 transition 一致）。
- disabled 时保持可见：表格按钮常驻无此问题，悬停按钮需在 spinner 期间也保持显示，避免播放发起中按钮消失闪烁。
- hover 放大：继承 `.btn-play` 基类的圆形与居中布局；另加 `.btn-play-card:hover:not(:disabled)` 的 `transform: scale(1.1)` + `background: #4338ca`，与 `.btn-play-album` hover 效果一致。

## 4. 与左下角排序角标的共存

`.card-badge` 当前 `max-width: calc(100% - 12px)`，长文本可能延伸到右下角按钮下方。将角标最大宽度收紧为 `calc(100% - 44px)`（28px 按钮 + 6px 右侧边距 + 10px 间隙），为按钮恒预留空间，避免角标与按钮重叠（两者 z-index 相同，DOM 顺序上前者在上，重叠时角标会遮住按钮）。

## 5. 不改动的部分

- `.card-overlay` 保持 `pointer-events: none`，遮罩内容仍仅为专辑名/艺术家，点击空白区域仍是选中/取消选中。
- 无封面占位（💿）、排序角标、选中高亮等既有行为不变。
- 主进程、preload、播放条（PlayerBar）零改动。
