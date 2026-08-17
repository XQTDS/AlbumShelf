import { app, screen, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * 窗口状态持久化
 *
 * 窗口关闭时将位置、尺寸与最大化状态保存到 userData 目录下的
 * window-state.json 文件，下次启动时恢复。
 */

const STATE_FILE = 'window-state.json'

export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

function getStatePath(): string {
  return join(app.getPath('userData'), STATE_FILE)
}

function isWindowState(value: unknown): value is WindowState {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return (
    typeof state.x === 'number' &&
    typeof state.y === 'number' &&
    typeof state.width === 'number' &&
    typeof state.height === 'number' &&
    typeof state.isMaximized === 'boolean'
  )
}

/**
 * 加载保存的窗口状态
 *
 * 文件不存在或内容无效时返回 null（使用默认窗口参数）。
 */
export function loadWindowState(): WindowState | null {
  const filePath = getStatePath()

  if (!existsSync(filePath)) {
    return null
  }

  try {
    const state = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
    return isWindowState(state) ? state : null
  } catch (error) {
    console.error('读取窗口状态文件失败:', error)
    return null
  }
}

/**
 * 保存窗口状态（关闭时调用）
 *
 * 使用 getNormalBounds() 记录非最大化时的边界：最大化关闭时，
 * 下次启动仍能恢复用户手动调整过的尺寸与位置。
 */
export function saveWindowState(window: BrowserWindow): void {
  if (window.isDestroyed()) return

  const state: WindowState = {
    ...window.getNormalBounds(),
    isMaximized: window.isMaximized()
  }

  try {
    writeFileSync(getStatePath(), JSON.stringify(state, null, 2), 'utf-8')
  } catch (error) {
    console.error('写入窗口状态文件失败:', error)
  }
}

/**
 * 校验保存的窗口边界在当前某个显示器上可见
 *
 * 显示器拔出或分辨率变化后，旧位置可能完全在屏幕外，需要回退到默认值。
 */
export function isValidBounds(state: WindowState): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const overlapWidth =
      Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x)
    const overlapHeight =
      Math.min(state.y + state.height, area.y + area.height) - Math.max(state.y, area.y)
    // 至少露出 100×100 的可交互区域，保证标题栏可拖动
    return overlapWidth >= 100 && overlapHeight >= 100
  })
}
