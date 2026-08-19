## ADDED Requirements

### Requirement: 菜单栏关于入口

系统 SHALL 在应用菜单栏提供「帮助」菜单，包含「关于 AlbumShelf」菜单项。

#### Scenario: 点击关于菜单项

- **WHEN** 用户点击菜单「帮助 → 关于 AlbumShelf」（macOS 为应用菜单「关于 AlbumShelf」）
- **THEN** 主进程 SHALL 向渲染进程发送 `menu:openAbout` 事件，渲染进程 SHALL 弹出关于弹窗

#### Scenario: 窗口不存在时点击菜单项

- **WHEN** 主窗口已销毁或不存在时点击关于菜单项
- **THEN** 系统 SHALL 静默忽略，不抛异常

### Requirement: 关于弹窗内容

系统 SHALL 提供「关于 AlbumShelf」模态弹窗，展示应用信息。

#### Scenario: 展示应用信息

- **WHEN** 关于弹窗打开
- **THEN** 弹窗 SHALL 展示：应用名与版本号（`app.getVersion()` 动态获取，格式 `vX.Y.Z`）、一句话定位「以专辑为单位的网易云音乐收藏管理器」、功能简介、关于作者（业余时间开发的游戏程序员背景）、AI 生成声明（Claude Opus 4.6 + DeepSeek V4 Pro）、技术栈标签、已知问题说明、开发者标识（XQTDS）与「访问 GitHub 仓库」按钮

#### Scenario: 已知问题说明

- **WHEN** 关于弹窗打开
- **THEN** 弹窗「已知问题」分区 SHALL 展示两条说明：MusicBrainz 搜索算法与收录库有限、缺失风格标签时建议参考 RateYourMusic 手动添加（RYM 有访问保护无法自动抓取）；应用内播放基于 ncm-cli 存在版权缺失、播放无反应时建议移步网易云 App 播放

#### Scenario: 打开 GitHub 仓库

- **WHEN** 用户点击弹窗内「访问 GitHub 仓库」按钮
- **THEN** 系统 SHALL 调用系统默认浏览器打开 `https://github.com/XQTDS/AlbumShelf`

#### Scenario: 关闭弹窗

- **WHEN** 用户点击弹窗右上角关闭按钮、点击弹窗外部遮罩或按下 Esc
- **THEN** 弹窗 SHALL 关闭

#### Scenario: 弹窗打开时按下 Esc

- **WHEN** 关于弹窗处于打开状态且用户按下 Esc
- **THEN** 系统 SHALL 仅关闭弹窗，不关闭详情抽屉
