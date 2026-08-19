# 介质图标候选（icon candidates）

供「实体收藏」标记（黑胶/CD/磁带）选型使用的候选图标，通过 [Iconify API](https://api.iconify.design/) 下载，共 14 枚。

## 目录

- `vinyl/` — 黑胶候选（5 枚）
- `cd/` — CD 候选（4 枚）
- `cassette/` — 磁带候选（5 枚）
- `preview.html` — 可视化对比页（可直接在浏览器打开，或查看发布的 Artifact 版本）

## 候选清单

| 编号 | 文件 | 来源 | 风格 | 许可 |
|---|---|---|---|---|
| V1 | vinyl/01-ph-phosphor.svg | Phosphor `vinyl-record` | 线性 | MIT |
| V2 | vinyl/02-fa7-solid.svg | Font Awesome Free 7 `record-vinyl` | 实心 | CC BY 4.0 |
| V3 | vinyl/03-solar-linear.svg | Solar `vinyl-record-linear` | 线性 | MIT |
| V4 | vinyl/04-mdi-album.svg | Material Design Icons `album` | 实心 | Apache 2.0 |
| V5 | vinyl/05-twemoji.svg | Twemoji `1f4bd`（💽） | 彩色 | CC BY 4.0 |
| C1 | cd/01-fa6-solid.svg | Font Awesome Free 6 `compact-disc` | 实心 | CC BY 4.0 |
| C2 | cd/02-mdi-disc.svg | Material Design Icons `disc` | 实心 | Apache 2.0 |
| C3 | cd/03-iconoir.svg | Iconoir `compact-disc` | 线性 | MIT |
| C4 | cd/04-twemoji.svg | Twemoji `1f4bf`（💿） | 彩色 | CC BY 4.0 |
| T1 | cassette/01-lucide.svg | Lucide `cassette-tape` | 线性 | ISC |
| T2 | cassette/02-ph-phosphor.svg | Phosphor `cassette-tape` | 实心 | MIT |
| T3 | cassette/03-fa7-solid.svg | Font Awesome Free 7 `tape` | 实心 | CC BY 4.0 |
| T4 | cassette/04-mingcute.svg | MingCute `audio-tape-line` | 线性 | Apache 2.0 |
| T5 | cassette/05-twemoji.svg | Twemoji `1f4fc`（📼） | 彩色 | CC BY 4.0 |

单色图标使用 `fill="currentColor"` / `stroke="currentColor"`，接入应用后随文字颜色（主题色）着色。

## 选型记录

- 2026-08-19：初版候选 14 枚生成，待用户选定（黑胶/CD/磁带各一枚）。
- 2026-08-19：用户选定 **V4（MDI `album`，单色 currentColor）+ C4（Twemoji `1f4bf`，彩色）+ T5（Twemoji `1f4fc`，彩色）**。单色黑胶随文字颜色着色，CD/磁带保持彩色。图标已内联至渲染层 `MediaIcon.vue`（来源标注在组件注释中）。
