# 设计：窗口状态持久化

## 1. 存储文件

- 新增 `src/main/window-state.ts` 模块，状态保存到 `app.getPath('userData')` 下的 `window-state.json`
- 与 `settings.json`（用户配置，见 enrich-settings spec）分离：窗口状态是运行时瞬态数据，每次关闭都会重写整个文件，不应与用户配置混在同一文件、互相污染

## 2. 保存时机

- 在 `mainWindow.on('close')` 中保存，覆盖正常关闭、菜单退出、macOS 关闭窗口后重新激活等全部路径
- 使用 `getNormalBounds()` 记录非最大化边界 + `isMaximized()` 记录最大化状态：最大化关闭时，下次启动仍能恢复用户手动调整过的尺寸与位置

## 3. 恢复与校验

`createWindow()` 时读取状态文件：

- 文件不存在 / JSON 解析失败 / 字段缺失或类型不符 → 使用默认 1200×800（原行为）
- 状态有效 → 应用保存的 x/y/width/height，width/height clamp 到 minWidth(900)/minHeight(600) 以上
- 校验保存的边界与任一显示器 workArea 的交集 ≥ 100×100，不满足则忽略保存值、使用默认尺寸（防止显示器拔出后窗口出现在屏幕外）
- `isMaximized` 为 true 时，在 `show: false` 阶段调用 `maximize()`，先最大化再显示，无闪烁

## 4. 代码改动

- 新增 `src/main/window-state.ts`：
  - `WindowState` 接口（x/y/width/height/isMaximized）
  - `loadWindowState(): WindowState | null`（含类型校验）
  - `saveWindowState(window: BrowserWindow): void`
  - `isValidBounds(state: WindowState): boolean`
- `src/main/index.ts` `createWindow()`：
  - 读取保存状态，构造 BrowserWindow 选项（x/y/width/height 或默认值）
  - `isMaximized` 时在显示前 `maximize()`
  - 注册 `close` 事件保存状态

## 5. Spec 更新

- 新增 `openspec/specs/window-state/spec.md`（窗口状态持久化/恢复/屏幕外防护）
