# 介质图标候选（icon candidates）

供「实体收藏」标记（黑胶/CD/磁带）选型使用的候选图标，通过 [Iconify API](https://api.iconify.design/) 及 Wikimedia Commons 获取，共 15 枚。

## 目录

- `vinyl/` — 黑胶候选（12 枚：首轮 5 枚 + 第二轮 6 枚 + 用户自选 1 枚）
- `cd/` — CD 候选（4 枚）
- `cassette/` — 磁带候选（5 枚）
- `preview.html` — 可视化对比页（含第二轮应用场景模拟：浅底徽章/深底角标，可直接在浏览器打开）

## 候选清单

| 编号 | 文件 | 来源 | 风格 | 许可 |
|---|---|---|---|---|
| V1 | vinyl/01-ph-phosphor.svg | Phosphor `vinyl-record` | 线性 | MIT |
| V2 | vinyl/02-fa7-solid.svg | Font Awesome Free 7 `record-vinyl` | 实心 | CC BY 4.0 |
| V3 | vinyl/03-solar-linear.svg | Solar `vinyl-record-linear` | 线性 | CC BY 4.0 |
| V4 | vinyl/04-mdi-album.svg | Material Design Icons `album` | 实心 | Apache 2.0 |
| V5 | vinyl/05-twemoji.svg | Twemoji `1f4bd`（💽） | 彩色 | CC BY 4.0 |
| V6 | vinyl/06-lucide-disc3.svg | Lucide `disc-3` | 线性凹槽 | ISC |
| V7 | vinyl/07-ph-vinyl-fill.svg | Phosphor `vinyl-record-fill` | 实心凹槽 | MIT |
| V8 | vinyl/08-solar-bold-duotone.svg | Solar `vinyl-record-bold-duotone` | 双色实心 | CC BY 4.0 |
| V9 | vinyl/09-streamline-ultimate-color.svg | Streamline Ultimate Color `vinyl-record` | 彩色 | CC BY 4.0 |
| V10 | vinyl/10-icon-park-record-player.svg | IconPark `record-player`（唱片机） | 彩色 | Apache 2.0 |
| V11 | vinyl/11-custom-twemoji-style.svg | 自绘（Twemoji 风格，调色板源自 Twemoji） | 彩色 | CC BY 4.0 |
| V12 | vinyl/12-wikimedia-vinyl.svg | Wikimedia Commons `Vinyl record.svg`（BenBois 绘，源自 OpenClipart） | 黑白灰写实 | 公有领域（PD-shape） |
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
彩色图标（V5、V9–V12、C4、T5）使用固定填充色，不受文字颜色影响（V12 为黑白灰写实配色，同属固定色）。

> 注：`vinyl/File_Vinyl_record.svg` 是用户从 Wikimedia Commons 描述页「另存为」保存的网页 HTML（非 SVG 本体），真正的 SVG 已下载为 `vinyl/12-wikimedia-vinyl.svg`。

## 选型记录

- 2026-08-19：初版候选 14 枚生成，待用户选定（黑胶/CD/磁带各一枚）。
- 2026-08-19：用户选定 **V4（MDI `album`，单色 currentColor）+ C4（Twemoji `1f4bf`，彩色）+ T5（Twemoji `1f4fc`，彩色）**。单色黑胶随文字颜色着色，CD/磁带保持彩色。图标已内联至渲染层 `MediaIcon.vue`（来源标注在组件注释中）。
- 2026-08-20：用户反馈黑胶图标在应用中变白——V4 为单色图标，在唱片墙角标（深底白字）与详情面板选中态按钮（主色底白字）下整体变白。第二轮新增 6 枚备选（V6–V11）：V6–V8 单色凹槽款（同样随文字变色，若选单色可在 CSS 中固定角标文字色解决）、V9–V11 彩色款（不受文字颜色影响）。待用户选定后替换 `MediaIcon.vue` 中黑胶分支。
- 2026-08-20：用户对 V6–V11 均不满意，自选了 Wikimedia Commons 的 `Vinyl record.svg`（BenBois 绘，源自 OpenClipart，公有领域 PD-shape，黑白灰写实配色），收录为 **V12**。已清洗（去除 XML 声明/元数据/未引用的死梯度定义，id 加 `wmVinyl` 前缀）后内联至 `MediaIcon.vue` 黑胶分支。颜色固定不受文字色影响，许可为公有领域、无需署名。
