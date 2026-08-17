# 任务清单

## 实现

- [x] 新增 `src/main/window-state.ts`：`WindowState` 接口、`loadWindowState`（含类型校验）、`saveWindowState`（getNormalBounds + isMaximized）、`isValidBounds`（workArea 交集校验）
- [x] `src/main/index.ts` `createWindow()`：读取状态构造窗口选项（clamp 最小尺寸）、最大化恢复、注册 `close` 保存回调
- [x] 新增 `openspec/specs/window-state/spec.md`

## 收尾

- [ ] 用户手动 `npm run dev` QA（调整尺寸后重启恢复；最大化关闭后重启仍最大化；删除/篡改 window-state.json 后回退默认）
- [x] 归档 change 到 `openspec/changes/archive/`
