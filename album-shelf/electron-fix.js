/**
 * 修复 Electron require 问题的补丁
 * 
 * 问题：当 Electron 运行时，require('electron') 被解析到 
 * node_modules/electron/index.js 而不是 Electron 内置模块。
 * 
 * 解决方案：在模块加载前，将 electron 添加到 Module._cache
 */

const Module = require('module');

// 保存原始的 require
const originalLoad = Module._load;

// 劫持 Module._load
Module._load = function(request, parent, isMain) {
  // 如果请求的是 electron 模块
  if (request === 'electron') {
    // 检查是否在 Electron 环境中
    if (process.versions && process.versions.electron) {
      // 返回 Electron 内置模块
      // Electron 内部使用 process._linkedBinding 来访问原生模块
      const electronModule = {};
      
      // 获取 Electron 内置 API
      const browserAPIs = [
        'app', 'autoUpdater', 'BaseWindow', 'BrowserView', 'BrowserWindow',
        'contentTracing', 'dialog', 'globalShortcut', 'ipcMain', 'Menu',
        'MenuItem', 'nativeTheme', 'net', 'netLog', 'Notification',
        'powerMonitor', 'powerSaveBlocker', 'protocol', 'pushNotifications',
        'safeStorage', 'screen', 'session', 'ShareMenu', 'shell',
        'systemPreferences', 'TouchBar', 'Tray', 'utilityProcess',
        'webContents', 'webFrameMain', 'desktopCapturer', 'MessageChannelMain',
        'MessagePortMain'
      ];
      
      // 从 Electron 内部获取 API
      for (const api of browserAPIs) {
        try {
          const binding = process._linkedBinding(`electron_browser_${api.toLowerCase()}`);
          if (binding && binding[api]) {
            electronModule[api] = binding[api];
          }
        } catch (e) {
          // 某些 API 可能不可用
        }
      }
      
      return electronModule;
    }
  }
  
  return originalLoad.apply(this, arguments);
};

console.log('[electron-fix] Module loader patched');
