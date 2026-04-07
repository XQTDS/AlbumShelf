import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// ==================== AlbumShelf API ====================

const albumShelfAPI = {
  // 同步操作
  syncStart: () => ipcRenderer.invoke('sync:start'),

  // 专辑查询
  albumList: (options: {
    search?: string
    artist?: string
    genre?: string
    sortBy?: 'mb_rating' | 'release_date'
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: number
  }) => ipcRenderer.invoke('album:list', options),

  albumFilters: () => ipcRenderer.invoke('album:filters'),

  // 曲目查询
  trackListByAlbum: (albumId: number) => ipcRenderer.invoke('track:listByAlbum', albumId),
  trackSyncByAlbum: (albumId: number) => ipcRenderer.invoke('track:syncByAlbum', albumId),

  // 数据补全
  enrichStatus: () => ipcRenderer.invoke('enrich:status'),
  enrichStart: () => ipcRenderer.invoke('enrich:start'),

  // 补全进度监听
  onEnrichProgress: (
    callback: (progress: {
      current: number
      total: number
      albumTitle: string
      matched: boolean
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress)
    ipcRenderer.on('enrich:progress', handler)
    // 返回取消监听函数
    return () => ipcRenderer.removeListener('enrich:progress', handler)
  },

  // MusicBrainz 凭据管理
  mbSetCredentials: (credentials: { username: string; password: string }) =>
    ipcRenderer.invoke('mb:setCredentials', credentials),

  mbCheckCredentials: () => ipcRenderer.invoke('mb:checkCredentials'),

  mbClearCredentials: () => ipcRenderer.invoke('mb:clearCredentials'),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
}

// Expose APIs to renderer via contextBridge
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', albumShelfAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts)
  window.electron = electronAPI
  // @ts-ignore (define in d.ts)
  window.api = albumShelfAPI
}