# 技术方案

## 菜单栏

- `src/main/index.ts` 的「帮助」菜单仅保留「关于 AlbumShelf」一项，删除「访问 GitHub 仓库」菜单项及其 `shell.openExternal` 调用（`shell` 仍被 CSP/`setWindowOpenHandler` 使用，import 保留）

## 弹窗

- `AboutModal.vue` 在「技术栈」分区之后、底部之前插入「已知问题」分区
- 每条说明采用「图标标题 + 描述文字」结构，样式沿用弹窗深色主题（正文 `#ccc`、标题 `#888`）
- 内容文案：
  1. 🧭 MusicBrainz 数据补全 — MusicBrainz 的搜索算法与收录库有限，部分专辑可能匹配不到；若专辑缺失风格标签，建议参考 RateYourMusic 的信息手动添加（RYM 有访问保护、无法自动抓取，因此数据源退而求其次选择了 MusicBrainz）
  2. ▶️ 应用内播放 — 播放基于 ncm-cli，与网易云音乐 App 相比存在较多版权缺失；若点击播放后无反应，建议移步网易云 App 播放

## 涉及文件

- `src/main/index.ts`：菜单项删除
- `src/renderer/src/AboutModal.vue`：新增「已知问题」分区
