import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// ==================== AlbumShelf API ====================

/** 模糊匹配确认项 */
interface ConfirmedFuzzyMatch {
  originalTitle: string
  matchedTitle: string
  artist: string
  neteaseId: string
}

const albumShelfAPI = {
  // 同步操作
  syncStart: () => ipcRenderer.invoke('sync:start'),

  // 确认模糊匹配
  syncConfirmFuzzyMatches: (confirmedMatches: ConfirmedFuzzyMatch[]) =>
    ipcRenderer.invoke('sync:confirmFuzzyMatches', confirmedMatches),

  // 随机专辑
  albumRandom: () => ipcRenderer.invoke('album:random'),

  // 专辑查询
  albumList: (options: {
    search?: string
    artist?: string
    genre?: string
    sortBy?: 'mb_rating' | 'release_date' | 'user_rating'
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: number
  }) => ipcRenderer.invoke('album:list', options),

  albumFilters: () => ipcRenderer.invoke('album:filters'),

  // 曲目查询
  trackListByAlbum: (albumId: number) => ipcRenderer.invoke('track:listByAlbum', albumId),
  trackSyncByAlbum: (albumId: number) => ipcRenderer.invoke('track:syncByAlbum', albumId),

  // 封面获取
  albumFetchCover: (albumId: number, force?: boolean) =>
    ipcRenderer.invoke('album:fetchCover', albumId, force),

  // 单张专辑重新同步（封面 + 曲目 + 评分 + 风格）
  albumResync: (albumId: number) => ipcRenderer.invoke('album:resync', albumId),

  // 用户评分
  albumSetRating: (albumId: number, rating: number | null) =>
    ipcRenderer.invoke('album:setRating', albumId, rating),

  // 风格统计
  genreStats: () => ipcRenderer.invoke('genre:stats'),

  // 风格标签管理
  setAlbumGenres: (albumId: number, genres: string[]) =>
    ipcRenderer.invoke('album:setGenres', albumId, genres),

  // 播放控制
  playerPlayAlbum: (albumId: number) => ipcRenderer.invoke('player:playAlbum', albumId),
  playerPlaySong: (encryptedId: string, originalId: number) =>
    ipcRenderer.invoke('player:playSong', encryptedId, originalId),

  // 数据补全
  enrichStatus: () => ipcRenderer.invoke('enrich:status'),
  enrichStart: () => ipcRenderer.invoke('enrich:start'),
  enrichAlbumsWithoutMbData: () => ipcRenderer.invoke('enrich:enrichAlbumsWithoutMbData'),
  enrichReEnrichAll: () => ipcRenderer.invoke('enrich:reEnrichAll'),

  // 模糊匹配逐条确认（新机制）
  onFuzzyConfirmRequest: (
    callback: (data: {
      albumId: number
      albumTitle: string
      albumArtist: string
      coverUrl: string | null
      candidates: {
        mbid: string
        mbTitle: string
        mbArtist: string
        score: number
        releaseDate: string | null
      }[]
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on('enrich:fuzzy-confirm-request', handler)
    return () => ipcRenderer.removeListener('enrich:fuzzy-confirm-request', handler)
  },
  sendFuzzyConfirmReply: (reply: { mbid: string } | null) =>
    ipcRenderer.send('enrich:fuzzy-confirm-reply', reply),

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

  // 应用设置
  onMenuOpenSettings: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:openSettings', handler)
    return () => ipcRenderer.removeListener('menu:openSettings', handler)
  },
  settingsGetEnrichStrategies: () => ipcRenderer.invoke('settings:getEnrichStrategies'),
  settingsSetEnrichStrategies: (strategies: Record<string, boolean>) =>
    ipcRenderer.invoke('settings:saveEnrichStrategies', strategies),

  // MusicBrainz 凭据管理
  mbSetCredentials: (credentials: { username: string; password: string }) =>
    ipcRenderer.invoke('mb:setCredentials', credentials),

  mbCheckCredentials: () => ipcRenderer.invoke('mb:checkCredentials'),

  mbClearCredentials: () => ipcRenderer.invoke('mb:clearCredentials'),

  // 菜单事件监听
  onMenuEnrichAlbumsWithoutMbData: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:enrichAlbumsWithoutMbData', handler)
    return () => ipcRenderer.removeListener('menu:enrichAlbumsWithoutMbData', handler)
  },

  onMenuReEnrichAll: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:reEnrichAll', handler)
    return () => ipcRenderer.removeListener('menu:reEnrichAll', handler)
  },

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // ==================== 网易云音乐认证 ====================

  // 获取当前登录状态
  authGetStatus: () => ipcRenderer.invoke('auth:getStatus'),

  // 生成登录二维码
  authGenerateQrcode: () => ipcRenderer.invoke('auth:generateQrcode'),

  // 检查扫码状态
  authCheckQrcode: (key: string) => ipcRenderer.invoke('auth:checkQrcode', key),

  // 退出登录
  authLogout: () => ipcRenderer.invoke('auth:logout'),

  // 监听登录状态变化
  onAuthStatusChanged: (
    callback: (status: { isLoggedIn: boolean; user: { userId: number; nickname: string; avatarUrl: string | null } | null }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, status: any) => callback(status)
    ipcRenderer.on('auth:statusChanged', handler)
    return () => ipcRenderer.removeListener('auth:statusChanged', handler)
  },

  // 监听登录要求（应用启动时未登录）
  onLoginRequired: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('auth:loginRequired', handler)
    return () => ipcRenderer.removeListener('auth:loginRequired', handler)
  },

  // 监听菜单栏登录按钮点击
  onMenuOpenLogin: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:openLogin', handler)
    return () => ipcRenderer.removeListener('menu:openLogin', handler)
  },

  // 监听自动同步事件（启动时已登录）
  onAutoSync: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('auth:autoSync', handler)
    return () => ipcRenderer.removeListener('auth:autoSync', handler)
  },

  // 监听菜单栏同步专辑事件
  onMenuSyncAlbums: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:syncAlbums', handler)
    return () => ipcRenderer.removeListener('menu:syncAlbums', handler)
  },

  // 监听菜单栏风格统计事件
  onMenuGenreStats: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:genreStats', handler)
    return () => ipcRenderer.removeListener('menu:genreStats', handler)
  },

  // 监听菜单栏校验 ID 事件
  onMenuVerifyIds: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:verifyIds', handler)
    return () => ipcRenderer.removeListener('menu:verifyIds', handler)
  },

  // ==================== 在线搜索 ====================

  // 在线搜索专辑
  albumSearchOnline: (keyword: string) =>
    ipcRenderer.invoke('album:searchOnline', keyword),

  // 添加专辑到收藏
  albumAddToCollection: (album: {
    netease_album_id: string
    netease_original_id: number
    title: string
    artist: string
    cover_url?: string | null
  }) => ipcRenderer.invoke('album:addToCollection', album),

  // 获取已收藏专辑的网易云 ID 列表（用于重复检测）
  albumGetCollectedNeteaseIds: () =>
    ipcRenderer.invoke('album:getCollectedNeteaseIds'),

  // ==================== 专辑 ID 校验与修复 ====================

  // 通过 albumId 获取专辑详情
  albumGetDetailById: (albumId: string) => ipcRenderer.invoke('album:getDetailById', albumId),

  // 批量校验所有专辑的 netease_album_id 正确性
  verifyAlbumIds: () => ipcRenderer.invoke('album:verifyIds'),

  // 修复单张专辑的 netease_album_id
  fixAlbumId: (params: { albumId: number; newNeteaseAlbumId: string; newOriginalId: number; newTitle: string }) =>
    ipcRenderer.invoke('album:fixId', params),

  // 监听校验进度
  onVerifyProgress: (
    callback: (progress: { current: number; total: number }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress)
    ipcRenderer.on('album:verifyProgress', handler)
    return () => ipcRenderer.removeListener('album:verifyProgress', handler)
  }
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