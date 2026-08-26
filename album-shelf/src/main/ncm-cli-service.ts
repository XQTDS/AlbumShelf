import { execFile } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { sep, join, delimiter } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import { writeFileSync, existsSync, rmSync } from 'fs'

const execFileAsync = promisify(execFile)

/** 内置 ncm-cli 的 npm 包名 */
const NCM_CLI_PACKAGE = '@music163/ncm-cli'

// ==================== Types ====================

/** ncm-cli 标准 JSON 返回结构（数据查询类命令） */
interface NcmCliResponse<T> {
  code: number
  subCode: string | null
  message: string | null
  data: T
}

/** ncm-cli 播放控制类命令返回结构 */
interface NcmCliPlayerResponse {
  success: boolean
  message?: string
  [key: string]: unknown
}

/** ncm-cli album tracks 返回的单首曲目 */
export interface NcmCliTrack {
  originalId: number
  id: string
  name: string
  duration: number
  artists: NcmCliArtist[]
  fullArtists: NcmCliArtist[]
  album: {
    originalId: number
    id: string
    name: string
  }
  liked: boolean
  coverImgUrl: string | null
}

export interface NcmCliArtist {
  originalId: number
  id: string
  name: string
  coverImgUrl: string | null
}

/** ncm-cli album get 返回的专辑详情 */
export interface NcmCliAlbumDetail {
  originalId: number
  id: string
  name: string
  language: string
  coverImgUrl: string | null
  company: string | null
  transName: string | null
  aliaName: string | null
  genre: string | null
  artists: NcmCliArtist[]
  briefDesc: string
  description: string
  publishTime: number
}

/** ncm-cli search album 返回的搜索结果 */
export interface NcmCliAlbumSearchResult {
  originalId: number
  id: string // 32位 hex，用于 ncm-cli 命令参数
  name: string
  language: string
  coverImgUrl: string | null
  company: string | null
  transName: string | null
  aliaName: string
  genre: string
  artists: NcmCliArtist[]
  briefDesc: string
  description: string
  publishTime: number
}

/** ncm-cli search album 返回的数据结构 */
interface NcmCliAlbumSearchResponse {
  recordCount: number
  records: NcmCliAlbumSearchResult[]
}

/** ncm-cli album collected 返回的单张收藏专辑 */
export interface NcmCliCollectedAlbum {
  originalId: number
  id: string // 32位 hex，用于 ncm-cli 命令参数
  name: string
  language: string
  coverImgUrl: string | null
  company: string | null
  transName: string | null
  aliaName: string | null
  genre: string | null
  artists: NcmCliArtist[]
  briefDesc: string
  description: string
  publishTime: number
}

/** ncm-cli album collected 返回的数据结构 */
export interface NcmCliCollectedAlbumResponse {
  /** 注意：ncm-cli 0.1.6 实测该字段恒为 0，不可用于翻页终止判断 */
  recordCount: number
  records: NcmCliCollectedAlbum[]
}

/** ncm-cli comment list-hot 返回的单条评论 */
export interface NcmCliComment {
  id: string
  content: string
  likedCount: number
  creator: {
    originalId: number
    id: string
    nickname: string
    avatarUrl: string | null
    signature: string | null
  }
  /** 毫秒时间戳 */
  time: number
  liked: boolean
}

/** ncm-cli comment list-hot 返回的数据结构 */
export interface NcmCliCommentListResponse {
  /** 评论总数（实测为真实值，可用于展示） */
  recordCount: number
  records: NcmCliComment[]
}

/** 用户信息 */
export interface NcmUser {
  userId: number
  nickname: string
  avatarUrl: string | null
}

/** 登录状态 */
export interface NcmLoginStatus {
  isLoggedIn: boolean
  user: NcmUser | null
}

/** 网易云 API 凭证配置状态 */
export interface NcmCredentialStatus {
  /** 是否已配置（appId 可读回或凭证文件存在） */
  configured: boolean
  /** 读回的 appId；未配置或读不到时为 null（UI 兜底只显示"已配置"） */
  appId: string | null
}

/** 播放器完整状态（ncm-cli state 命令返回的 state 字段） */
export interface PlaybackState {
  /** 'playing' | 'stopped' | 'unknown'；注意：pause 后 ncm-cli 也返回 'stopped'，会话是否存活需结合 queueLength 判定 */
  status: string
  /** 合并串 "歌名 - 艺术家-"（艺术家尾部带 "-"）；空队列时无此字段，为 null */
  title: string | null
  /** 当前播放位置（秒，浮点）；未知为 null */
  position: number | null
  /** 总时长（秒，浮点）；未知为 null */
  duration: number | null
  /** 队列中当前曲目下标 */
  currentIndex: number
  /** 队列长度 */
  queueLength: number
}

/** 播放控制命令结果（next/prev 队列边界时 ok=false 携带提示文案） */
export interface PlayerCommandResult {
  ok: boolean
  message: string | null
}

/** ncm-cli login status 返回结构 */
interface NcmLoginStatusResponse {
  account?: {
    id: number
  }
  profile?: {
    nickname: string
    avatarUrl: string
  }
}

/** 二维码生成结果 */
export interface NcmQrcodeResult {
  qrcodeUrl: string
  key: string
}

/** 扫码状态 */
export type NcmQrcodeStatus = 'waiting' | 'scanned' | 'confirmed' | 'expired'

/** 扫码检查结果 */
export interface NcmQrcodeCheckResult {
  status: NcmQrcodeStatus
  user?: NcmUser
}

/** 登录流程结果 */
interface NcmLoginResult {
  qrcodeUrl: string
  key: string
  status: string
}

// ==================== NcmCliService ====================

const NCM_CLI_TIMEOUT = 15_000 // 15 seconds

/** executePlayerCmd 业务失败错误信息前缀（next/prev 边界提示复用其文案） */
const NCM_PLAYER_FAIL_PREFIX = 'ncm-cli 播放控制失败: '

/**
 * 解析内置 ncm-cli 的入口文件路径（package.json main 字段指向的 dist/index.js）
 *
 * 打包后 node_modules 位于 app.asar 内，而 ELECTRON_RUN_AS_NODE 子进程
 * 无法读取 asar 中的文件（实测 MODULE_NOT_FOUND），因此将路径重写到
 * electron-builder asarUnpack 解包后的真实文件位置 app.asar.unpacked。
 */
function resolveNcmCliEntry(): string {
  const resolved = require.resolve(NCM_CLI_PACKAGE)
  if (!app.isPackaged) {
    return resolved
  }
  // app.asar.unpacked 不含 `\app.asar\` 片段（后接 `.` 而非分隔符），无需担心误判
  const marker = `${sep}app.asar${sep}`
  const idx = resolved.lastIndexOf(marker)
  if (idx === -1) {
    return resolved
  }
  return (
    resolved.slice(0, idx + 1) +
    'app.asar.unpacked' +
    sep +
    resolved.slice(idx + marker.length)
  )
}

/** 内置 ncm-cli 入口路径缓存（进程生命周期内不变） */
let ncmCliEntry: string | null = null

/** 获取内置 ncm-cli 入口路径；依赖缺失时给出明确错误 */
function getNcmCliEntry(): string {
  if (ncmCliEntry === null) {
    try {
      ncmCliEntry = resolveNcmCliEntry()
    } catch (error) {
      console.error('[ncm-cli] 解析内置 ncm-cli 入口失败:', error)
      throw new Error(
        '内置 ncm-cli 不可用：@music163/ncm-cli 依赖缺失，请重新执行 npm install 或重新安装应用'
      )
    }
  }
  return ncmCliEntry
}

/**
 * 计算捆绑 mpv 的目录（Windows 专用，其余平台返回 null）
 *
 * 打包模式位于安装目录 resources/mpv（electron-builder win.extraResources
 * 产物），开发模式位于项目 build/mpv（npm run fetch-mpv 产物）。
 * 捆绑 mpv.exe 存在时把该目录前置到 ncm-cli 子进程 PATH：ncm-cli 的
 * PlayerDaemon 继承子进程 env 并按 PATH 解析 mpv（2026-08-20 隔离 PATH
 * 实验实测确认），从而实现开箱即播、无需用户自装 mpv。
 */
function resolveBundledMpvDir(): string | null {
  if (process.platform !== 'win32') {
    return null
  }
  const dir = app.isPackaged
    ? join(process.resourcesPath, 'mpv')
    : join(app.getAppPath(), 'build', 'mpv')
  return existsSync(join(dir, 'mpv.exe')) ? dir : null
}

/** 捆绑 mpv 目录缓存（进程生命周期内不变；无捆绑时为 null） */
let bundledMpvDir: string | null | undefined

/** 获取捆绑 mpv 目录；不存在（未拉取/非 Windows）时返回 null，行为回落用户 PATH 中的 mpv */
function getBundledMpvDir(): string | null {
  if (bundledMpvDir === undefined) {
    bundledMpvDir = resolveBundledMpvDir()
  }
  return bundledMpvDir
}

/**
 * 将 ncm publishTime（北京时间零点的毫秒时间戳）换算为北京日历日期
 *
 * publishTime 直接取 UTC 日期会早一天（北京时间零点 = 前一日 UTC 16:00），
 * 因此加上 UTC+8 偏移后再取日期，与网易云展示的发行日期一致。
 * @returns 形如 "2014-09-25" 的日期字符串
 */
export function publishTimeToReleaseDate(publishTime: number): string {
  const BJ_OFFSET_MS = 8 * 60 * 60 * 1000
  return new Date(publishTime + BJ_OFFSET_MS).toISOString().split('T')[0]
}

/** 需要登录的错误 */
export class NcmLoginRequiredError extends Error {
  constructor(message: string = '请先登录') {
    super(message)
    this.name = 'NcmLoginRequiredError'
  }
}

/** 检查是否是需要登录的错误消息 */
function isLoginRequiredMessage(message: string): boolean {
  const loginRequiredPatterns = [
    '请先登录',
    '需要登录',
    '未登录',
    'login',
    '登录'
  ]
  const lowerMessage = message.toLowerCase()
  return loginRequiredPatterns.some(pattern => lowerMessage.includes(pattern.toLowerCase()))
}

/** 私钥掩码：仅保留前 8 个字符（与 ncm-cli 自身回显口径一致），过短则全掩 */
function maskPrivateKey(key: string): string {
  if (key.length <= 8) {
    return '***'
  }
  return `${key.slice(0, 8)}***`
}

/**
 * 解析 `config get appId` 的纯文本输出
 *
 * 实测格式（0.1.6）：
 * - 已配置 → `appId: <值> (凭证文件)`
 * - 未配置 → `appId: (未配置)`
 * 含"(凭证文件)"标记但解析不出值时兜底判定为"已配置"（appId 为 null，UI 只显示状态）；
 * 其余未知格式保守判定为"未配置"。
 */
function parseAppIdStatus(stdout: string): NcmCredentialStatus {
  const line = stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.startsWith('appId:'))
  if (!line) {
    return { configured: false, appId: null }
  }
  const rest = line.slice('appId:'.length).trim()
  if (!rest || rest === '(未配置)') {
    return { configured: false, appId: null }
  }
  if (rest.includes('(凭证文件)')) {
    const value = rest.replace('(凭证文件)', '').trim()
    return { configured: true, appId: value || null }
  }
  return { configured: false, appId: null }
}

/**
 * NcmCliService - 封装内置 ncm-cli 命令行工具调用
 *
 * 通过 child_process.execFile 以 ELECTRON_RUN_AS_NODE=1 启动应用自身
 * 运行时（Electron 内置 Node）执行随应用打包的 ncm-cli 入口文件，
 * 不依赖系统 Node 与全局安装的 ncm-cli。
 * 固定 --output json 参数，解析返回的 JSON。
 */
export class NcmCliService {
  /**
   * 执行内置 ncm-cli 命令
   *
   * 所有 execFile 调用收敛到此处：开发模式以 electron.exe、打包模式以
   * AlbumShelf.exe 运行内置 CLI 入口；无 shell，参数直接进入子进程 argv
   * （含空格等特殊字符由 Node 按 Windows 规则转义）。
   */
  private execNcmCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const mpvDir = getBundledMpvDir()
    return execFileAsync(process.execPath, [getNcmCliEntry(), ...args], {
      timeout: NCM_CLI_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        // 捆绑 mpv 优先于用户自装 mpv（PATH 前置，PlayerDaemon 继承 env 后按 PATH 解析）
        ...(mpvDir ? { PATH: `${mpvDir}${delimiter}${process.env.PATH ?? ''}` } : {})
      }
    })
  }

  /**
   * 执行 ncm-cli 命令并返回解析后的数据
   *
   * @param args ncm-cli 子命令及参数（不含 ncm-cli 本身和 --output json）
   * @returns 解析后的 data 字段
   * @throws ncm-cli 不可用、业务错误、超时
   */
  async execute<T>(args: string[]): Promise<T> {
    const fullArgs = [...args, '--output', 'json']
    const cmdStr = `ncm-cli ${fullArgs.join(' ')}`
    console.log(`[ncm-cli] 执行: ${cmdStr}`)

    try {
      const { stdout, stderr } = await this.execNcmCli(fullArgs)

      if (stderr) {
        console.warn(`[ncm-cli] stderr: ${stderr.substring(0, 500)}`)
      }
      console.log(`[ncm-cli] stdout: ${stdout.substring(0, 500)}`)

      // ncm-cli 输出可能包含非 JSON 前缀行，找到 JSON 起始位置
      const jsonStart = stdout.indexOf('{')
      if (jsonStart === -1) {
        // 命令没有返回 JSON 数据，返回 null
        return null as T
      }
      const jsonStr = stdout.substring(jsonStart)
      const response: NcmCliResponse<T> = JSON.parse(jsonStr)

      if (response.code !== 200) {
        const errorMessage = response.message || '未知错误'
        // 检查是否需要登录
        if (isLoginRequiredMessage(errorMessage)) {
          throw new NcmLoginRequiredError(errorMessage)
        }
        throw new Error(
          `ncm-cli 业务错误 (code: ${response.code}): ${errorMessage}`
        )
      }

      return response.data
    } catch (error: unknown) {
      console.error(`[ncm-cli] 命令失败: ${cmdStr}`, error)
      if (error instanceof Error) {
        // 超时
        if (error.message.includes('TIMEOUT') || (error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
          throw new Error('ncm-cli 执行超时（15 秒），请检查网络连接')
        }
        // 可执行文件或 CLI 入口缺失（ENOENT）
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error('内置 ncm-cli 启动失败（可执行文件或 CLI 入口缺失），请重新安装应用或执行 npm install')
        }
        throw error
      }
      throw new Error(`ncm-cli 调用失败: ${String(error)}`)
    }
  }

  /**
   * 获取指定专辑的曲目列表
   *
   * @param albumId 网易云音乐加密专辑 ID（32 位 hex）
   * @returns 曲目数组，按专辑内顺序排列
   */
  async getAlbumTracks(albumId: string): Promise<NcmCliTrack[]> {
    return this.execute<NcmCliTrack[]>(['album', 'tracks', '--albumId', albumId])
  }

  /**
   * 获取指定专辑的详情信息（包含封面图 coverImgUrl）
   *
   * @param albumId 网易云音乐加密专辑 ID（32 位 hex）
   * @returns 专辑详情
   */
  async getAlbumDetail(albumId: string): Promise<NcmCliAlbumDetail> {
    return this.execute<NcmCliAlbumDetail>(['album', 'get', '--albumId', albumId])
  }

  /**
   * 搜索专辑
   *
   * @param keyword 搜索关键字（通常是"专辑名 艺术家名"）
   * @param limit 返回数量，默认 10
   * @returns 搜索结果数组
   */
  async searchAlbum(keyword: string, limit: number = 10): Promise<NcmCliAlbumSearchResult[]> {
    // 无 shell 直传参数，含空格的参数由 Node 按 Windows 规则转义，无需手动包裹引号
    const response = await this.execute<NcmCliAlbumSearchResponse>([
      'search',
      'album',
      '--keyword',
      keyword,
      '--limit',
      String(limit)
    ])
    return response.records || []
  }

  /**
   * 获取用户收藏的专辑列表（单页）
   *
   * @param limit 每页数量（建议固定 50；ncm-cli 0.1.6 实测 limit 过小时可能返回 HTTP 400）
   * @param offset 偏移量
   * @returns 单页结果，recordCount 恒为 0（ncm-cli 0.1.6 行为），翻页需依赖 records 是否为空
   */
  async getCollectedAlbumsPage(
    limit: number,
    offset: number
  ): Promise<NcmCliCollectedAlbumResponse> {
    return this.execute<NcmCliCollectedAlbumResponse>([
      'album',
      'collected',
      '--limit',
      String(limit),
      '--offset',
      String(offset)
    ])
  }

  /**
   * 获取指定专辑的热门评论
   *
   * @param albumId 网易云音乐加密专辑 ID（32 位 hex）
   * @param limit 返回数量，默认 20
   * @param offset 偏移量，默认 0
   * @returns 评论列表与总数（recordCount 为真实值）
   */
  async getAlbumHotComments(
    albumId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<NcmCliCommentListResponse> {
    return this.execute<NcmCliCommentListResponse>([
      'comment',
      'list-hot',
      '--type',
      'album',
      '--resourceId',
      albumId,
      '--limit',
      String(limit),
      '--offset',
      String(offset)
    ])
  }

  // ==================== 艺术家（预留） ====================
  //
  // ncm-cli 0.1.6 探测结论（2026-08-26，见 openspec/changes/2026-08-26-artist-follow/design.md）：
  // - `ncm-cli artist songs --artistId <加密ID> --startTime --endTime --limit --offset`
  //   获取指定发布时间内的艺人歌曲列表，--artistId 要求**加密**艺人 ID（32 位 hex）
  // - `ncm-cli search all --keyword <词>` 综合搜索，返回 artists 数组
  //   （{ originalId, id, name, coverImgUrl }，明文 + 加密 ID 都有）
  // - 无 `search artist` 子命令；artist 族目前仅 `songs` 一个子命令
  //
  // 后续「关注艺术家的新专辑」功能在此新增封装，如：
  //   getArtistSongs(encryptedArtistId, startTime?, endTime?) → execute(['artist', 'songs', ...])
  //   searchAll(keyword) → execute(['search', 'all', '--keyword', keyword])
  // 均走既有 execute<T>（自动附加 --output json 并解析 { code, data }）。
  // 关注数据侧已同时落库明文 original_id 与加密 encrypted_id（followed_artist 表）。

  // ==================== 播放控制 ====================

  /**
   * 执行播放控制类命令
   * 播放控制命令返回 { success, message } 格式，与数据查询命令的 { code, data } 不同
   */
  private async executePlayerCmd(args: string[]): Promise<NcmCliPlayerResponse> {
    const fullArgs = [...args, '--output', 'json']
    const cmdStr = `ncm-cli ${fullArgs.join(' ')}`
    console.log(`[ncm-cli] 执行: ${cmdStr}`)

    try {
      const { stdout, stderr } = await this.execNcmCli(fullArgs)

      if (stderr) {
        console.warn(`[ncm-cli] stderr: ${stderr.substring(0, 500)}`)
      }
      console.log(`[ncm-cli] stdout: ${stdout.substring(0, 500)}`)

      const jsonStart = stdout.indexOf('{')
      if (jsonStart === -1) {
        // 命令没有返回 JSON 数据，视为成功
        return { success: true } as NcmCliPlayerResponse
      }
      const jsonStr = stdout.substring(jsonStart)
      const response: NcmCliPlayerResponse = JSON.parse(jsonStr)

      if (!response.success) {
        const errorMessage = response.message || '未知错误'
        // 检查是否需要登录
        if (isLoginRequiredMessage(errorMessage)) {
          throw new NcmLoginRequiredError(errorMessage)
        }
        throw new Error(`${NCM_PLAYER_FAIL_PREFIX}${errorMessage}`)
      }

      return response
    } catch (error: unknown) {
      console.error(`[ncm-cli] 命令失败: ${cmdStr}`, error)
      if (error instanceof Error) {
        if (error.message.includes('TIMEOUT') || (error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
          throw new Error('ncm-cli 执行超时（15 秒），请检查网络连接')
        }
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error('内置 ncm-cli 启动失败（可执行文件或 CLI 入口缺失），请重新安装应用或执行 npm install')
        }
        throw error
      }
      throw new Error(`ncm-cli 调用失败: ${String(error)}`)
    }
  }

  /**
   * 清空播放队列并停止播放
   */
  async queueClear(): Promise<void> {
    await this.executePlayerCmd(['queue', 'clear'])
  }

  /**
   * 播放单曲（作为播放起始）
   *
   * @param encryptedId 歌曲加密 ID（32 位 hex）
   * @param originalId 歌曲原始 ID
   */
  async playSong(encryptedId: string, originalId: number): Promise<void> {
    await this.executePlayerCmd([
      'play',
      '--song',
      '--encrypted-id', encryptedId,
      '--original-id', String(originalId)
    ])
  }

  /**
   * 将歌曲加入播放队列末尾
   *
   * @param encryptedId 歌曲加密 ID（32 位 hex）
   * @param originalId 歌曲原始 ID
   */
  async queueAdd(encryptedId: string, originalId: number): Promise<void> {
    await this.executePlayerCmd([
      'queue', 'add',
      '--encrypted-id', encryptedId,
      '--original-id', String(originalId)
    ])
  }

  /**
   * 暂停播放
   */
  async pause(): Promise<void> {
    await this.executePlayerCmd(['pause'])
  }

  /**
   * 恢复播放
   */
  async resume(): Promise<void> {
    await this.executePlayerCmd(['resume'])
  }

  /**
   * 下一首
   *
   * 队列边界时 ncm-cli 返回 success: false 与中文提示（如"已是最后一首"），
   * 作为正常结果返回（ok=false）而非抛错；登录要求等真实错误照常抛出。
   */
  async next(): Promise<PlayerCommandResult> {
    return this.executeQueueStepCmd(['next'])
  }

  /**
   * 上一首
   */
  async prev(): Promise<PlayerCommandResult> {
    return this.executeQueueStepCmd(['prev'])
  }

  /**
   * 执行上一首/下一首类命令：队列边界 success: false 转换为正常返回
   */
  private async executeQueueStepCmd(args: string[]): Promise<PlayerCommandResult> {
    try {
      const response = await this.executePlayerCmd(args)
      return { ok: true, message: response.message ?? null }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(NCM_PLAYER_FAIL_PREFIX)) {
        return { ok: false, message: error.message.slice(NCM_PLAYER_FAIL_PREFIX.length) }
      }
      throw error
    }
  }

  /**
   * 跳转到指定播放位置（播放中与暂停态均支持）
   *
   * @param seconds 目标位置（秒，非负）
   */
  async seek(seconds: number): Promise<void> {
    await this.executePlayerCmd(['seek', String(seconds)])
  }

  /**
   * 设置音量（ncm-cli 无音量读取命令，仅写不读；越界值由 ncm-cli 钳位）
   *
   * @param level 音量 0-100
   */
  async setVolume(level: number): Promise<void> {
    await this.executePlayerCmd(['volume', String(level)])
  }

  /**
   * 查询完整播放器状态
   *
   * 与 getState 不同：字段级容错（缺失字段给默认值）、单次查询失败
   * 返回 null 而非抛错——供渲染层轮询降级（保留上次状态）。
   */
  async getPlaybackState(): Promise<PlaybackState | null> {
    try {
      const response = await this.executePlayerCmd(['state'])
      const raw = (response as unknown as { state?: Record<string, unknown> }).state
      if (!raw || typeof raw !== 'object') {
        return null
      }
      return {
        status: typeof raw.status === 'string' ? raw.status : 'unknown',
        title: typeof raw.title === 'string' ? raw.title : null,
        position: typeof raw.position === 'number' ? raw.position : null,
        duration: typeof raw.duration === 'number' ? raw.duration : null,
        currentIndex: typeof raw.currentIndex === 'number' ? raw.currentIndex : 0,
        queueLength: typeof raw.queueLength === 'number' ? raw.queueLength : 0
      }
    } catch (error) {
      console.warn('[ncm-cli] 查询播放状态失败:', error)
      return null
    }
  }

  /**
   * 查询当前播放器状态
   */
  async getState(): Promise<{ status: string; [key: string]: unknown }> {
    const response = await this.executePlayerCmd(['state'])
    const state = (response as unknown as { state?: { status: string } }).state
    return state ?? { status: 'unknown' }
  }

  /**
   * 等待播放器进入 playing 状态
   *
   * 每次 state 查询都是一次子进程启动（~0.4s），先睡 1s 再轮询的旧策略
   * 最顺利也要 ~1.4s。改为短暂首延迟（给播放后端启动留缓冲）后以短间隔
   * 轮询，最顺利 ~0.6-0.9s，总超时仍兜底 5s。
   *
   * @param maxWaitMs 最大等待时间（毫秒），默认 5 秒
   * @param intervalMs 轮询间隔（毫秒），默认 300ms
   * @param firstDelayMs 首次查询前的延迟（毫秒），默认 200ms
   */
  async waitForPlaying(
    maxWaitMs = 5_000,
    intervalMs = 300,
    firstDelayMs = 200
  ): Promise<boolean> {
    const start = Date.now()
    await new Promise((resolve) => setTimeout(resolve, firstDelayMs))
    while (Date.now() - start < maxWaitMs) {
      try {
        const state = await this.getState()
        if (state.status === 'playing') {
          return true
        }
      } catch {
        // 查询失败继续重试
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    console.warn('[ncm-cli] 等待播放超时')
    return false
  }

  // ==================== 凭证配置 ====================

  /**
   * 执行 config 系列命令（纯文本输出，非 JSON，不追加 --output json）
   *
   * config 命令失败时 exit code 非 0，execFileAsync reject 且 error 对象
   * 携带 stdout/stderr——提取 CLI 输出的中文错误文案透传给调用方。
   */
  private async execNcmCliConfig(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const cmdStr = `ncm-cli ${args.join(' ')}`
    console.log(`[ncm-cli] 执行: ${cmdStr}`)

    try {
      const result = await this.execNcmCli(args)
      if (result.stderr) {
        console.warn(`[ncm-cli] stderr: ${result.stderr.substring(0, 500)}`)
      }
      console.log(`[ncm-cli] stdout: ${result.stdout.substring(0, 500)}`)
      return result
    } catch (error: unknown) {
      console.error(`[ncm-cli] 命令失败: ${cmdStr}`, error)
      if (error instanceof Error) {
        const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
        // 超时与入口缺失与既有数据命令口径一致
        if (error.message.includes('TIMEOUT') || err.code === 'ETIMEDOUT') {
          throw new Error('ncm-cli 执行超时（15 秒），请检查网络连接')
        }
        if (err.code === 'ENOENT') {
          throw new Error('内置 ncm-cli 启动失败（可执行文件或 CLI 入口缺失），请重新安装应用或执行 npm install')
        }
        // 非零退出码：stderr 优先（如"无效的配置项"），兜底 stdout，最后才是 error.message
        const detail = (err.stderr || err.stdout || '').trim() || error.message
        throw new Error(detail)
      }
      throw new Error(`ncm-cli 调用失败: ${String(error)}`)
    }
  }

  /**
   * 以非交互方式配置网易云 API 凭证（appId + privateKey）
   *
   * 通过 ncm-cli 官方 `config set` 命令完成（实测：无 TTY 可用、仅写
   * credentials.enc.json、未登录可配置、登录态不受影响）：
   * - appId 非机密，直接以 argv 传入
   * - privateKey 绝不进入 argv：先写入系统临时目录的随机名临时文件
   *   （不含换行，写入后 existsSync 校验，规避 CLI"文件不存在时把路径
   *   本身当密钥写入"的静默陷阱），以文件路径传入 `config set privateKey`，
   *   finally 删除临时文件
   * - 完成后读回 appId 校验写入结果与预期一致
   *
   * @throws 参数为空、CLI 执行失败或读回校验不一致时抛出（message 为中文，透传 UI）
   */
  async configureWithCredentials(appId: string, privateKey: string): Promise<void> {
    const trimmedAppId = appId.trim()
    const trimmedKey = privateKey.trim()
    if (!trimmedAppId || !trimmedKey) {
      throw new Error('App ID 与 Private Key 均不能为空')
    }

    console.log(
      `[ncm-cli] 配置凭证: appId=${trimmedAppId}, privateKey=${maskPrivateKey(trimmedKey)}`
    )

    // 1. 写 appId（非机密，直接 argv 传值）
    await this.execNcmCliConfig(['config', 'set', 'appId', trimmedAppId])

    // 2. 写 privateKey：临时文件路径输入（密钥不进 argv）
    const tempPath = join(tmpdir(), `ncm-key-${randomBytes(6).toString('hex')}.tmp`)
    try {
      writeFileSync(tempPath, trimmedKey, 'utf8')
      if (!existsSync(tempPath)) {
        throw new Error('私钥临时文件写入失败，请重试')
      }
      await this.execNcmCliConfig(['config', 'set', 'privateKey', tempPath])
    } finally {
      try {
        rmSync(tempPath, { force: true })
      } catch {
        // 临时文件删除失败不影响主流程（位于系统临时目录，系统会定期清理）
      }
    }

    // 3. 读回校验
    const status = await this.getCredentialConfigStatus()
    if (!status.configured || status.appId !== trimmedAppId) {
      throw new Error('凭证写入校验失败：读回的 appId 与输入不一致，请重试')
    }
  }

  /**
   * 获取网易云 API 凭证配置状态
   *
   * 执行 `config get appId` 解析纯文本输出。CLI 不可用或执行失败时
   * 降级返回"未配置"，不抛错——设置界面仅展示状态。
   */
  async getCredentialConfigStatus(): Promise<NcmCredentialStatus> {
    try {
      const { stdout } = await this.execNcmCli(['config', 'get', 'appId'])
      return parseAppIdStatus(stdout)
    } catch (error) {
      console.error('[ncm-cli] 获取凭证配置状态失败:', error)
      return { configured: false, appId: null }
    }
  }

  // ==================== 登录相关 ====================

  /**
   * 获取当前登录用户信息
   * user info 返回标准的 { code: 200, data } 格式
   * @returns 用户信息，如果未登录则返回 null
   */
  async getUserInfo(): Promise<NcmUser | null> {
    try {
      const result = await this.execute<{
        originalId: number
        id: string
        nickname: string
        avatarUrl: string
        signature?: string
      }>(['user', 'info'])
      
      if (result && result.nickname) {
        return {
          userId: result.originalId,
          nickname: result.nickname,
          avatarUrl: result.avatarUrl || null
        }
      }
      return null
    } catch (error) {
      console.error('[ncm-cli] 获取用户信息失败:', error)
      return null
    }
  }

  /**
   * 检查当前登录状态
   * login --check 返回 { success: boolean, message: string } 格式
   * 如果已登录，会调用 user info 获取详细用户信息
   * @returns 登录状态信息，包含 isLoggedIn 和 user 信息
   */
  async getLoginStatus(): Promise<NcmLoginStatus> {
    try {
      const fullArgs = ['login', '--check', '--output', 'json']
      const cmdStr = `ncm-cli ${fullArgs.join(' ')}`
      console.log(`[ncm-cli] 执行: ${cmdStr}`)

      const { stdout, stderr } = await this.execNcmCli(fullArgs)

      if (stderr) {
        console.warn(`[ncm-cli] stderr: ${stderr.substring(0, 500)}`)
      }
      console.log(`[ncm-cli] stdout: ${stdout.substring(0, 500)}`)

      const jsonStart = stdout.indexOf('{')
      if (jsonStart === -1) {
        return { isLoggedIn: false, user: null }
      }
      
      const result = JSON.parse(stdout.substring(jsonStart)) as {
        success: boolean
        message?: string
      }
      
      // success: true 表示已登录
      if (result.success) {
        // 获取详细用户信息（包含昵称）
        const userInfo = await this.getUserInfo()
        
        return {
          isLoggedIn: true,
          user: userInfo || {
            userId: 0,
            nickname: '已登录用户',
            avatarUrl: null
          }
        }
      }
      
      return { isLoggedIn: false, user: null }
    } catch (error) {
      console.error('[ncm-cli] 检查登录状态失败:', error)
      // 执行失败视为未登录
      return { isLoggedIn: false, user: null }
    }
  }

  /**
   * 启动登录流程
   * ncm-cli login --background 返回二维码链接并在后台轮询
   */
  async startLogin(): Promise<NcmLoginResult> {
    // login --background 返回的是 { success, qrCodeUrl, clickableUrl, message } 格式
    // 不是标准的 { code, data } 格式，需要使用 executePlayerCmd
    const fullArgs = ['login', '--background', '--output', 'json']
    const cmdStr = `ncm-cli ${fullArgs.join(' ')}`
    console.log(`[ncm-cli] 执行: ${cmdStr}`)

    const { stdout, stderr } = await this.execNcmCli(fullArgs)

    if (stderr) {
      console.warn(`[ncm-cli] stderr: ${stderr.substring(0, 500)}`)
    }
    console.log(`[ncm-cli] stdout: ${stdout.substring(0, 500)}`)

    const jsonStart = stdout.indexOf('{')
    if (jsonStart === -1) {
      throw new Error('ncm-cli login 返回格式异常')
    }
    
    const result = JSON.parse(stdout.substring(jsonStart)) as {
      success: boolean
      qrCodeUrl?: string
      clickableUrl?: string
      message?: string
    }
    
    if (!result.success) {
      throw new Error(result.message || '启动登录失败')
    }
    
    return {
      qrcodeUrl: result.qrCodeUrl || result.clickableUrl || '',
      key: '', // ncm-cli 后台模式不需要 key，它自己会轮询
      status: 'waiting'
    }
  }

  /**
   * 生成登录二维码
   * 返回的是一个链接 URL，前端需要生成二维码图片展示
   * @returns 二维码链接 URL
   */
  async generateQrcode(): Promise<NcmQrcodeResult> {
    const result = await this.startLogin()
    return {
      qrcodeUrl: result.qrcodeUrl,
      key: result.key
    }
  }

  /**
   * 检查登录状态（用于轮询）
   * 使用 --check 选项检查当前状态
   */
  async checkQrcodeStatus(_key: string): Promise<NcmQrcodeCheckResult> {
    try {
      const status = await this.getLoginStatus()
      
      if (status.isLoggedIn && status.user) {
        return {
          status: 'confirmed',
          user: status.user
        }
      }
      
      // 未登录则继续等待
      return { status: 'waiting' }
    } catch (error) {
      console.error('[ncm-cli] 检查扫码状态失败:', error)
      // 如果检查失败，返回等待状态继续轮询
      return { status: 'waiting' }
    }
  }

  /**
   * 退出登录
   * logout 返回 { success: boolean, message: string } 格式
   */
  async logout(): Promise<void> {
    const fullArgs = ['logout', '--output', 'json']
    const cmdStr = `ncm-cli ${fullArgs.join(' ')}`
    console.log(`[ncm-cli] 执行: ${cmdStr}`)

    const { stdout, stderr } = await this.execNcmCli(fullArgs)

    if (stderr) {
      console.warn(`[ncm-cli] stderr: ${stderr.substring(0, 500)}`)
    }
    console.log(`[ncm-cli] stdout: ${stdout.substring(0, 500)}`)

    const jsonStart = stdout.indexOf('{')
    if (jsonStart !== -1) {
      const result = JSON.parse(stdout.substring(jsonStart)) as {
        success: boolean
        message?: string
      }
      
      if (!result.success) {
        throw new Error(result.message || '退出登录失败')
      }
    }
    // success: true 或无 JSON 输出都视为成功
  }
}
