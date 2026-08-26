import { BrowserWindow } from 'electron'

// 主窗口显式引用。
// Electron 不保证 BrowserWindow.getAllWindows() 的返回顺序，多窗口（关注列表窗口）
// 场景下向主窗口转发事件/挂载对话框必须精确定位，不能依赖 getAllWindows()[0]。
let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

/** 返回存活的主窗口；已销毁或未创建时返回 null */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}
