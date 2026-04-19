import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { initDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc-handlers'
import { initAuthOnStartup, setMenuBuilder, getLoginStatus, logout } from './auth-service'
import type { NcmLoginStatus } from './auth-service'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'AlbumShelf',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 设置 CSP：允许加载网易云音乐封面图片
  // 仅对 HTML 页面响应设置 CSP header，不影响其他资源请求
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
      // 移除已有的 CSP headers（可能大小写不同），避免冲突
      const headers = { ...details.responseHeaders }
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'content-security-policy') {
          delete headers[key]
        }
      }
      headers['Content-Security-Policy'] = [
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; connect-src 'self' ws: http: https:"
      ]
      callback({ responseHeaders: headers })
    } else {
      callback({ responseHeaders: details.responseHeaders })
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Dev server URL or production file
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 构建应用菜单栏
 * @param loginStatus 当前登录状态，用于动态显示账户菜单
 */
function buildAppMenu(loginStatus?: NcmLoginStatus): void {
  const isMac = process.platform === 'darwin'
  const status = loginStatus || getLoginStatus()
  const accountLabel = status.isLoggedIn ? `账户: ${status.user?.nickname}` : '账户: 未登录'

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS 应用菜单
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const, label: '关于 AlbumShelf' },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const, label: '退出 AlbumShelf' }
            ]
          }
        ]
      : []),
    // 账户菜单
    {
      label: accountLabel,
      submenu: status.isLoggedIn
        ? [
            {
              label: '退出登录',
              click: async (): Promise<void> => {
                try {
                  await logout()
                } catch (error) {
                  console.error('退出登录失败:', error)
                }
              }
            }
          ]
        : [
            {
              label: '登录',
              click: (): void => {
                const mainWindow = BrowserWindow.getAllWindows()[0]
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('menu:openLogin')
                }
              }
            }
          ]
    },
    // 数据菜单
    {
      label: '数据',
      submenu: [
        {
          label: '同步专辑列表',
          click: (): void => {
            const mainWindow = BrowserWindow.getAllWindows()[0]
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:syncAlbums')
            }
          }
        },
        { type: 'separator' },
        {
          label: '补全缺失MB数据的专辑',
          click: (): void => {
            const mainWindow = BrowserWindow.getAllWindows()[0]
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:enrichAlbumsWithoutMbData')
            }
          }
        },
        {
          label: '重新补全所有专辑',
          click: (): void => {
            const mainWindow = BrowserWindow.getAllWindows()[0]
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:reEnrichAll')
            }
          }
        }
      ]
    },
    // 设置菜单
    {
      label: '设置',
      submenu: [
        {
          label: '匹配策略...',
          click: (): void => {
            const mainWindow = BrowserWindow.getAllWindows()[0]
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:openSettings')
            }
          }
        }
      ]
    },
    // 视图菜单
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  // Initialize database
  initDatabase()

  // Register IPC handlers
  registerIpcHandlers()

  // Set up menu builder for auth service
  setMenuBuilder(buildAppMenu)

  // Build initial application menu
  buildAppMenu()

  // Shell: open external URL in system browser
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    return shell.openExternal(url)
  })

  createWindow()

  // Initialize auth status after window is created
  // This will check login status and notify renderer if login is required
  await initAuthOnStartup()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})