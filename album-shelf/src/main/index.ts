import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc-handlers'

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
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 构建应用菜单栏
 */
function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'

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
    // 数据菜单
    {
      label: '数据',
      submenu: [
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
    // 视图菜单
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    // 窗口菜单
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const, label: '全部置于顶层' }
            ]
          : [{ role: 'close' as const, label: '关闭' }])
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  // Initialize database
  initDatabase()

  // Register IPC handlers
  registerIpcHandlers()

  // Build application menu
  buildAppMenu()

  // Shell: open external URL in system browser
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    return shell.openExternal(url)
  })

  createWindow()

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