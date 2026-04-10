import { BrowserWindow } from 'electron'
import { NcmCliService, NcmLoginRequiredError } from './ncm-cli-service'
import type { NcmLoginStatus, NcmUser, NcmQrcodeResult, NcmQrcodeCheckResult } from './ncm-cli-service'

// ==================== Types ====================

export type { NcmLoginStatus, NcmUser, NcmQrcodeResult, NcmQrcodeCheckResult }
export { NcmLoginRequiredError }

// ==================== AuthService ====================

const ncmCliService = new NcmCliService()

/** 当前登录状态（内存缓存） */
let currentLoginStatus: NcmLoginStatus = { isLoggedIn: false, user: null }

/** 菜单构建函数引用，由 index.ts 注入 */
let menuBuilder: ((status: NcmLoginStatus) => void) | null = null

/**
 * 设置菜单构建器
 * @param builder 菜单构建函数
 */
export function setMenuBuilder(builder: (status: NcmLoginStatus) => void): void {
  menuBuilder = builder
}

/**
 * 获取当前登录状态（内存缓存）
 */
export function getLoginStatus(): NcmLoginStatus {
  return currentLoginStatus
}

/**
 * 检查并更新登录状态
 * @returns 最新的登录状态
 */
export async function checkAndUpdateLoginStatus(): Promise<NcmLoginStatus> {
  try {
    const status = await ncmCliService.getLoginStatus()
    currentLoginStatus = status
    console.log('[auth-service] 登录状态更新:', status.isLoggedIn ? status.user?.nickname : '未登录')
    return status
  } catch (error) {
    console.error('[auth-service] 检查登录状态失败:', error)
    currentLoginStatus = { isLoggedIn: false, user: null }
    return currentLoginStatus
  }
}

/**
 * 生成登录二维码
 */
export async function generateQrcode(): Promise<NcmQrcodeResult> {
  return ncmCliService.generateQrcode()
}

/**
 * 检查扫码状态
 */
export async function checkQrcodeStatus(key: string): Promise<NcmQrcodeCheckResult> {
  const result = await ncmCliService.checkQrcodeStatus(key)
  
  // 如果登录成功，更新内存状态
  if (result.status === 'confirmed' && result.user) {
    currentLoginStatus = { isLoggedIn: true, user: result.user }
    rebuildMenu()
    notifyRenderer('auth:statusChanged', currentLoginStatus)
  }
  
  return result
}

/**
 * 退出登录
 */
export async function logout(): Promise<void> {
  await ncmCliService.logout()
  currentLoginStatus = { isLoggedIn: false, user: null }
  rebuildMenu()
  notifyRenderer('auth:statusChanged', currentLoginStatus)
}

/**
 * 重建菜单栏
 */
export function rebuildMenu(): void {
  if (menuBuilder) {
    menuBuilder(currentLoginStatus)
  }
}

/**
 * 通知渲染进程
 */
function notifyRenderer(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}

/**
 * 应用启动时初始化认证状态
 * 检查登录状态：
 * - 未登录时通知渲染进程显示登录引导
 * - 已登录时通知渲染进程自动同步专辑
 */
export async function initAuthOnStartup(): Promise<void> {
  const status = await checkAndUpdateLoginStatus()
  rebuildMenu()
  
  // 延迟发送，等待渲染进程准备就绪
  setTimeout(() => {
    if (status.isLoggedIn) {
      // 已登录，触发自动同步
      console.log('[auth-service] 已登录，触发自动同步专辑列表')
      notifyRenderer('auth:autoSync', null)
    } else {
      // 未登录，显示登录引导
      notifyRenderer('auth:loginRequired', null)
    }
  }, 1000)
}

/**
 * 触发打开登录弹窗
 * 用于当命令返回需要登录的错误时自动打开登录界面
 */
export function triggerLoginPopup(): void {
  console.log('[auth-service] 触发打开登录弹窗')
  notifyRenderer('auth:loginRequired', null)
}

/**
 * 处理需要登录的错误
 * 如果是 NcmLoginRequiredError，自动触发登录弹窗
 * @param error 错误对象
 * @returns 是否是登录错误
 */
export function handleLoginRequiredError(error: unknown): boolean {
  if (error instanceof NcmLoginRequiredError) {
    triggerLoginPopup()
    return true
  }
  return false
}
