import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { initDatabase, closeDatabase } from './database'
import { registerIpcHandlers, stopPlaybackOnQuit } from './ipc-handlers'
import { initAuthOnStartup, setMenuBuilder, getLoginStatus, logout } from './auth-service'
import type { NcmLoginStatus } from './auth-service'
import { loadWindowState, saveWindowState, isValidBounds } from './window-state'
import { setMainWindow, getMainWindow } from './window-ref'
// cover-cache 模块顶层注册 cover:// scheme（需在 app ready 前），保持顶层 import 即可
import { registerCoverProtocol } from './cover-cache'

const DEFAULT_WIDTH = 1200
const DEFAULT_HEIGHT = 800
const MIN_WIDTH = 900
const MIN_HEIGHT = 600

/** 关注列表独立窗口（单实例，关闭后置空） */
let followedWindow: BrowserWindow | null = null

function createWindow(): void {
  const savedState = loadWindowState()

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    title: 'AlbumShelf',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  }

  // 恢复上次关闭时的窗口位置与尺寸；保存的位置在当前显示器上不可见时回退默认值
  if (savedState && isValidBounds(savedState)) {
    windowOptions.x = savedState.x
    windowOptions.y = savedState.y
    windowOptions.width = Math.max(savedState.width, MIN_WIDTH)
    windowOptions.height = Math.max(savedState.height, MIN_HEIGHT)
  }

  const mainWindow = new BrowserWindow(windowOptions)

  // 登记主窗口引用（多窗口场景下事件转发/对话框挂载用，不依赖 getAllWindows 顺序）
  setMainWindow(mainWindow)
  mainWindow.on('closed', () => {
    setMainWindow(null)
  })

  // 恢复最大化状态（show: false 时先最大化再显示，避免闪烁）
  if (savedState?.isMaximized) {
    mainWindow.maximize()
  }

  // 关闭时保存窗口状态，供下次启动恢复
  mainWindow.on('close', () => {
    saveWindowState(mainWindow)
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
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http: cover:; connect-src 'self' ws: http: https:"
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
 * 打开独立的「关注列表」窗口（单实例：已打开则聚焦）。
 * CSP 与封面协议等由共享的默认 session / 协议层提供，无需重复注册。
 */
function createFollowedWindow(): void {
  if (followedWindow && !followedWindow.isDestroyed()) {
    followedWindow.focus()
    return
  }

  followedWindow = new BrowserWindow({
    width: 460,
    height: 560,
    minWidth: 360,
    minHeight: 440,
    show: false,
    title: '关注列表',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 独立窗口不显示应用菜单栏（Windows/Linux；macOS 为全局应用菜单，无需处理）
  followedWindow.setMenuBarVisibility(false)

  followedWindow.on('ready-to-show', () => {
    followedWindow?.show()
  })
  followedWindow.on('closed', () => {
    followedWindow = null
  })

  followedWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Dev server URL or production file
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    followedWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/followed.html')
  } else {
    followedWindow.loadFile(join(__dirname, '../renderer/followed.html'))
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

  // 向渲染进程发送「关于」弹窗事件（菜单项共用）
  const openAbout = (): void => {
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu:openAbout')
    }
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS 应用菜单
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: '关于 AlbumShelf', click: openAbout },
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
                const mainWindow = getMainWindow()
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
            const mainWindow = getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:syncAlbums')
            }
          }
        },
        {
          label: '补全缺失封面',
          click: (): void => {
            const mainWindow = getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:coverFill')
            }
          }
        },
        {
          label: '补全缺失发行日期',
          click: (): void => {
            const mainWindow = getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:releaseDateFill')
            }
          }
        },
        {
          label: '回填艺术家 ID',
          click: (): void => {
            const mainWindow = getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:artistIdFill')
            }
          }
        },
        { type: 'separator' },
        {
          label: '补全缺失MB数据的专辑',
          click: (): void => {
            const mainWindow = getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:enrichAlbumsWithoutMbData')
            }
          }
        },
        {
          label: '重新补全所有专辑',
          click: (): void => {
            const mainWindow = getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:reEnrichAll')
            }
          }
        },
        { type: 'separator' },
        {
          label: '导出数据...',
          click: (): void => {
            const mainWindow = getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:dbExport')
            }
          }
        },
        {
          label: '导入数据...',
          click: (): void => {
            const mainWindow = getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:dbImport')
            }
          }
        }
      ]
    },
    // 工具菜单
    {
      label: '工具',
      submenu: [
        {
          label: '关注列表',
          click: (): void => {
            createFollowedWindow()
          }
        },
        {
          label: '风格统计',
          click: (): void => {
            const mainWindow = getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:genreStats')
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
          label: '应用设置...',
          click: (): void => {
            const mainWindow = getMainWindow()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:openSettings')
            }
          }
        }
      ]
    },
    // 帮助菜单
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 AlbumShelf',
          click: openAbout
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  // Initialize database
  initDatabase()

  // Register cover:// protocol (封面本地缓存，需在数据库初始化后注册)
  registerCoverProtocol()

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

  // App version (关于弹窗展示用)
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
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

// 退出清理是否已执行（before-quit 重入保护：preventDefault 后二次 quit 直接放行）
let quitCleanupDone = false

// 退出前停止播放的兜底超时：ncm-cli 单命令自身有 15s 超时，
// state + queue clear 理论最坏 30s，5s 兜底保证退出不长时间卡顿
const STOP_PLAYBACK_TIMEOUT_MS = 5_000

app.on('before-quit', (event) => {
  if (quitCleanupDone) {
    return
  }
  quitCleanupDone = true
  event.preventDefault()

  // 播放器进程独立于应用运行，不随退出停止——先限时停止播放再退出
  Promise.race([
    stopPlaybackOnQuit(),
    new Promise<void>((resolve) => setTimeout(resolve, STOP_PLAYBACK_TIMEOUT_MS))
  ]).finally(() => {
    closeDatabase()
    app.quit()
  })
})