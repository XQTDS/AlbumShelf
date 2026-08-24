# 专辑实体介质标记 技术设计

## 1. 数据模型

### 1.1 枚举与常量

- 介质类型封闭集合：`vinyl`（黑胶）、`cd`（CD）、`cassette`（磁带），展示顺序固定为 黑胶 → CD → 磁带。
- 渲染层与主进程共用常量（主进程在 ipc-handlers.ts 校验用；渲染层在 App.vue 渲染用）：
  ```ts
  const MEDIA_TYPES = [
    { key: 'vinyl', label: '黑胶' },
    { key: 'cd', label: 'CD' },
    { key: 'cassette', label: '磁带' },
  ] as const
  ```
- 图标已由用户从 14 枚候选中选定（候选见 `icon-candidates/`）：
  - 黑胶：**MDI `album`**（单色，`fill="currentColor"`，随文字颜色着色）
  - CD：**Twemoji `1f4bf`**（彩色）
  - 磁带：**Twemoji `1f4fc`**（彩色）
  - 实现：内联 SVG 到新组件 `MediaIcon.vue`（宽高 `1em`，由 font-size 控制尺寸），组件注释标注来源与许可

### 1.2 存储格式

album 表新增 `physical_media TEXT`（可空）：

- 存储为按展示顺序排序的逗号分隔字符串，如 `'vinyl,cd'`
- 空集合（无标记）存 `NULL`（与 user_rating 未评分语义一致）
- 单值查询判断无需 LIKE 匹配精度问题（枚举 key 均不含逗号，`'vinyl,cd'` 全串比较/拆分解析即可）

## 2. 数据库迁移（`src/main/database.ts`）

沿用 user_rating 迁移模式，在 `initializeDatabase` 的 album 列迁移段追加：

```ts
// Add physical_media if missing
if (!albumColumns.some((c) => c.name === 'physical_media')) {
  db.exec('ALTER TABLE album ADD COLUMN physical_media TEXT')
}
```

### 导入路径兼容（同文件 importAlbums 事务）

导出走 `SELECT * FROM album`，新列自动包含，无需改动；**导入是显式列名**，需补：

- UPDATE 分支（`database.ts:191-196`）：列清单与 VALUES 追加 `physical_media`
- INSERT 分支（`database.ts:206-214`）：列清单与 VALUES 追加 `physical_media`

### 同步路径（`src/main/sync/sync-service.ts` / `src/main/album-service.ts`）

- `insertAlbum` 显式列不含 physical_media → 新专辑默认 NULL ✅ 无需改动
- `updateAlbum` 动态字段拼装，仅更新传入字段 → 同步不碰 physical_media ✅ 无需改动
- `album:resync` 单专辑重新同步走既有更新路径，不涉及该字段 ✅

## 3. IPC 接口

新增 `album:setPhysicalMedia`（参照 `album:setRating`，ipc-handlers.ts:527-553）：

```
album:setPhysicalMedia(albumId: number, mediaTypes: string[] | null)
→ { success: true } | { success: false, error: string }
```

- 校验：mediaTypes 为 null（清除）或字符串数组且每个值 ∈ `{vinyl, cd, cassette}`，非法值拒绝并返回错误
- 写入：合法数组去重后按展示顺序排序，`join(',')` 后经 `albumService.updateAlbum` 更新；空数组或 null 写 `NULL`
- 专辑不存在返回 `{ success: false, error: '专辑不存在 (id: …)' }`

## 4. preload 与类型

- `src/preload/index.ts`：新增 `albumSetPhysicalMedia(albumId, mediaTypes)` → `ipcRenderer.invoke('album:setPhysicalMedia', …)`
- `src/preload/index.d.ts`：补充对应类型声明
- `src/renderer/src/App.vue` 的渲染层 `Album` 接口（约 App.vue:671）：追加 `physical_media: string | null`

## 5. 详情面板（方案A 分段按钮组）

「我的评分」detail-section 之后新增「实体收藏」detail-section：

```html
<div class="detail-section">
  <div class="detail-label">实体收藏</div>
  <div class="media-segment">
    <button
      v-for="m in MEDIA_TYPES" :key="m.key"
      class="media-segment-btn"
      :class="{ active: hasMedia(selectedAlbum, m.key) }"
      @click.stop="toggleMedia(selectedAlbum.id, m.key)"
    >{{ m.icon }} {{ m.label }}</button>
  </div>
</div>
```

- 三枚按钮一排（flex），选中态填充高亮 + 图标强化，未选中态描边弱化
- 点击即切换（多值模型，互不影响），复用评分组件的乐观更新模式：立即更新 `selectedAlbum.physical_media` → 调 `albumSetPhysicalMedia` → 失败回退 + `showMessage` 错误提示
- `hasMedia` 辅助函数：将 `physical_media` 按 `,` split 后判断包含；`toggleMedia` 按切换结果重组数组（空则 null）

## 6. 表格视图「实体」列

- 表头新增 `<th class="col-media">实体</th>`，位于「我的评分」之后（不可排序，保持与风格列一致的非排序列样式）
- 单元格：有标记时并排渲染介质图标徽章（小圆角 chip，含图标+文字或纯图标，按固定展示顺序）；无标记显示 `—`
- 哨兵行 `colspan` 7 → 8

## 7. 唱片墙卡片角标

- 卡片左上角（`top: 6px; left: 6px`）渲染介质徽章，多枚横向并排
- 与左下角排序角标（`bottom: 6px; left: 6px`）、右下角播放按钮（`right: 6px; bottom: 6px`）不冲突；z-index 与 `.card-badge` 同级（z-index: 2）
- 徽章常驻显示（不随 hover 显隐），无标记不渲染

## 8. 不改动的部分

- 同步、补全、封面缓存、播放链路零改动
- 现有列宽/布局：新增列使用紧凑宽度（徽章为小 chip），详情面板新 section 样式复用 `.detail-section`/`.detail-label`
- 导出（`SELECT *`）自动包含新列；README 与 spec 收尾时同步

## 9. 风险与验证点

- 导入导出往返：导出含 physical_media 的库 → 导入 → 标记保留（需在 QA 中验证显式列补全无遗漏）
- 多值显示宽度：三枚徽章并排的表格列宽与唱片墙左上角空间（角标与遮罩标题的上下间距）需在 QA 中目测
- 乐观更新回退：模拟失败路径确认 UI 回退与错误提示（与评分一致）
