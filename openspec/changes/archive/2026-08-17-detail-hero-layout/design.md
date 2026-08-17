# 设计：详情 Hero 两栏布局

## 1. 布局结构

- `.detail-content`（flex column）内新增 `.detail-hero`（flex row）容器，包裹 `.detail-cover` 与 `.detail-info`
- `.detail-tracklist` 保持在 `.detail-hero` 之后，面板全宽
- 结构：`.detail-hero` = `.detail-cover`（左，固定占比）+ `.detail-info`（右，flex:1）

## 2. 封面流体尺寸

- `.detail-cover` 由固定 140×140 改为：`width: clamp(140px, 42%, 240px); aspect-ratio: 1 / 1;`（删除固定 height）
- `.cover-img` / `.cover-placeholder` 改为 100%×100%，img 增加 `display: block`
- 尺寸核算（面板 360–620px，内容区 = 面板 − 40px padding）：
  - 最窄（内容 320px）：封面 140px + gap 16px → 信息列 164px；星级评分约 100px 可放下，标签/元数据/链接原本即 `flex-wrap`，折行即可
  - 最宽（内容 580px）：封面 240px → 信息列 324px
  - 常规（窗口 1200px，面板 480px）：封面约 185px → 信息列约 239px
- 窗口最小 900px → 面板恒 ≥ 360px，`clamp` 下限兜底，**无需媒体查询**

## 3. 窄列适配

- `.genre-edit-input` / `.genre-edit-suggestions` 固定 `width: 200px` 在最窄信息列（164px）会溢出，改为 `width: 100%; max-width: 200px;`（全局已设 `box-sizing: border-box`）

## 4. 不变项

- `.detail-info` 保持 `flex: 1; min-width: 0`，内部四节（风格 / 我的评分 / 元数据 / 外链操作）内容与顺序不变
- 面板宽度、占位态、曲目列表、所有交互逻辑零改动
