import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// ==================== AlbumShelf API ====================

const albumShelfAPI = {
  // 同步操作
  syncStart: () => ipcRenderer.invoke('sync:start'),

  // 同步进度监听（fetching 阶段 total 为 null，writing 阶段为专辑总数）
  onSyncProgress: (
    callback: (progress: {
      phase: 'fetching' | 'writing'
      current: number
      total: number | null
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress)
    ipcRenderer.on('sync:progress', handler)
    // 返回取消监听函数
    return () => ipcRenderer.removeListener('sync:progress', handler)
  },

  // 随机专辑
  albumRandom: () => ipcRenderer.invoke('album:random'),

  // 专辑查询
  albumList: (options: {
    search?: string
    artist?: string
    genres?: string
    sortBy?: 'mb_rating' | 'release_date' | 'user_rating'
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: number
    fetchAll?: boolean
  }) => ipcRenderer.invoke('album:list', options),

  albumFilters: () => ipcRenderer.invoke('album:filters'),

  // 曲目查询
  trackListByAlbum: (albumId: number) => ipcRenderer.invoke('track:listByAlbum', albumId),
  trackSyncByAlbum: (albumId: number) => ipcRenderer.invoke('track:syncByAlbum', albumId),

  // 网易云热评
  albumComments: (albumId: number) => ipcRenderer.invoke('album:comments', albumId),

  // 封面获取
  albumFetchCover: (albumId: number, force?: boolean) =>
    ipcRenderer.invoke('album:fetchCover', albumId, force),

  // 批量补全缺失封面
  albumCoverFillStatus: () => ipcRenderer.invoke('album:coverFillStatus'),
  albumCoverFillStart: () => ipcRenderer.invoke('album:coverFillStart'),

  // 封面补全进度监听
  onCoverFillProgress: (
    callback: (progress: {
      current: number
      total: number
      albumTitle: string
      filled: number
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress)
    ipcRenderer.on('album:coverFillProgress', handler)
    // 返回取消监听函数
    return () => ipcRenderer.removeListener('album:coverFillProgress', handler)
  },

  // 批量回填缺失发行日期
  albumReleaseDateFillStart: () => ipcRenderer.invoke('album:releaseDateFillStart'),

  // 发行日期回填进度监听
  onReleaseDateFillProgress: (
    callback: (progress: {
      current: number
      total: number
      albumTitle: string
      filled: number
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress)
    ipcRenderer.on('album:releaseDateFillProgress', handler)
    // 返回取消监听函数
    return () => ipcRenderer.removeListener('album:releaseDateFillProgress', handler)
  },

  // 单张专辑重新同步（封面 + 曲目 + 评分 + 风格）
  albumResync: (albumId: number) => ipcRenderer.invoke('album:resync', albumId),

  // 用户评分
  albumSetRating: (albumId: number, rating: number | null) =>
    ipcRenderer.invoke('album:setRating', albumId, rating),

  // 实体介质标记（黑胶/CD/磁带，可多选）
  albumSetPhysicalMedia: (albumId: number, mediaTypes: string[] | null) =>
    ipcRenderer.invoke('album:setPhysicalMedia', albumId, mediaTypes),

  // 风格统计
  genreStats: () => ipcRenderer.invoke('genre:stats'),

  // 风格标签管理
  setAlbumGenres: (albumId: number, genres: string[]) =>
    ipcRenderer.invoke('album:setGenres', albumId, genres),

  // 播放控制
  playerPlayAlbum: (albumId: number) => ipcRenderer.invoke('player:playAlbum', albumId),
  playerPlaySong: (encryptedId: string, originalId: number) =>
    ipcRenderer.invoke('player:playSong', encryptedId, originalId),
  playerPause: () => ipcRenderer.invoke('player:pause'),
  playerResume: () => ipcRenderer.invoke('player:resume'),
  playerNext: () => ipcRenderer.invoke('player:next'),
  playerPrev: () => ipcRenderer.invoke('player:prev'),
  playerSeek: (seconds: number) => ipcRenderer.invoke('player:seek', seconds),
  playerSetVolume: (level: number) => ipcRenderer.invoke('player:volume', level),
  playerState: () => ipcRenderer.invoke('player:state'),
  playerStop: () => ipcRenderer.invoke('player:stop'),

  // 数据补全
  enrichStatus: () => ipcRenderer.invoke('enrich:status'),
  enrichStart: () => ipcRenderer.invoke('enrich:start'),
  enrichAlbumsWithoutMbData: () => ipcRenderer.invoke('enrich:enrichAlbumsWithoutMbData'),
  enrichReEnrichAll: () => ipcRenderer.invoke('enrich:reEnrichAll'),

  // 模糊匹配逐条确认（队列机制：主进程串行弹窗，同一时刻最多一个）
  onFuzzyConfirmRequest: (
    callback: (data: {
      albumId: number
      albumTitle: string
      albumArtist: string
      coverUrl: string | null
      pendingCount: number
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

  // 模糊确认结算结果（用户回复并写库后触发，用于刷新列表与风格统计）
  onFuzzyResolved: (
    callback: (data: { albumId: number; albumTitle: string; confirmed: boolean }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on('enrich:fuzzy-resolved', handler)
    return () => ipcRenderer.removeListener('enrich:fuzzy-resolved', handler)
  },

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

  // 网易云 API 凭证状态（内置凭证，只读）
  ncmGetCredentialStatus: () => ipcRenderer.invoke('ncm:getCredentialStatus'),

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

  // 应用版本号（关于弹窗展示用）
  appGetVersion: () => ipcRenderer.invoke('app:getVersion'),

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

  // 监听菜单栏同步专辑事件
  onMenuSyncAlbums: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:syncAlbums', handler)
    return () => ipcRenderer.removeListener('menu:syncAlbums', handler)
  },

  // 监听菜单栏补全缺失封面事件
  onMenuCoverFill: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:coverFill', handler)
    return () => ipcRenderer.removeListener('menu:coverFill', handler)
  },

  // 监听菜单栏补全缺失发行日期事件
  onMenuReleaseDateFill: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:releaseDateFill', handler)
    return () => ipcRenderer.removeListener('menu:releaseDateFill', handler)
  },

  // 监听菜单栏回填艺术家 ID 事件
  onMenuArtistIdFill: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:artistIdFill', handler)
    return () => ipcRenderer.removeListener('menu:artistIdFill', handler)
  },

  // 监听菜单栏风格统计事件
  onMenuGenreStats: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:genreStats', handler)
    return () => ipcRenderer.removeListener('menu:genreStats', handler)
  },

  // 监听菜单栏"关于"事件
  onMenuOpenAbout: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:openAbout', handler)
    return () => ipcRenderer.removeListener('menu:openAbout', handler)
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

  // ==================== 关注艺术家 ====================

  artistFollow: (name: string, originalId?: number | null, encryptedId?: string | null) =>
    ipcRenderer.invoke('artist:follow', name, originalId, encryptedId),

  artistUnfollow: (name: string) => ipcRenderer.invoke('artist:unfollow', name),

  artistListFollowed: () => ipcRenderer.invoke('artist:listFollowed'),

  // 关注状态变更广播（主窗口与关注列表窗口互相同步）
  onFollowedChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('followed:changed', handler)
    return () => ipcRenderer.removeListener('followed:changed', handler)
  },

  // 关注列表窗口：请求主窗口按艺术家筛选
  artistRequestFilter: (name: string) => ipcRenderer.send('followed:filterArtist', name),

  // 主窗口：接收关注列表窗口转发的筛选请求
  onArtistFilterRequest: (callback: (name: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, name: string) => callback(name)
    ipcRenderer.on('followed:filterArtist', handler)
    return () => ipcRenderer.removeListener('followed:filterArtist', handler)
  },

  // 关注列表窗口：关闭自身（Esc 快捷键）
  followedWindowClose: () => ipcRenderer.send('followed:closeWindow'),

  // ==================== 艺术家 ID 批量回填 ====================

  albumArtistIdFillStatus: () => ipcRenderer.invoke('album:artistIdFillStatus'),

  albumArtistIdFillStart: () => ipcRenderer.invoke('album:artistIdFillStart'),

  // 艺术家 ID 回填进度监听
  onArtistIdFillProgress: (
    callback: (progress: {
      current: number
      total: number
      albumTitle: string
      filled: number
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress)
    ipcRenderer.on('album:artistIdFillProgress', handler)
    // 返回取消监听函数
    return () => ipcRenderer.removeListener('album:artistIdFillProgress', handler)
  },

  // ==================== 数据导出/导入 ====================

  dbExport: () => ipcRenderer.invoke('db:export'),
  dbImport: () => ipcRenderer.invoke('db:import'),

  onMenuDbExport: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:dbExport', handler)
    return () => ipcRenderer.removeListener('menu:dbExport', handler)
  },
  onMenuDbImport: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:dbImport', handler)
    return () => ipcRenderer.removeListener('menu:dbImport', handler)
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