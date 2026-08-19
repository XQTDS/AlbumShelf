import { execFile } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { sep, join } from 'path'
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
    resolved.slice(idx + 'app.asar'.length)
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
    return execFileAsync(process.execPath, [getNcmCliEntry(), ...args], {
      timeout: NCM_CLI_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
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
        throw new Error(`ncm-cli 播放控制失败: ${errorMessage}`)
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
   * 查询当前播放器状态
   */
  async getState(): Promise<{ status: string; [key: string]: unknown }> {
    const response = await this.executePlayerCmd(['state'])
    const state = (response as unknown as { state?: { status: string } }).state
    return state ?? { status: 'unknown' }
  }

  /**
   * 等待播放器进入 playing 状态
   * @param maxWaitMs 最大等待时间（毫秒），默认 5 秒
   * @param intervalMs 轮询间隔（毫秒），默认 1000ms
   */
  async waitForPlaying(maxWaitMs = 5_000, intervalMs = 1000): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
      try {
        const state = await this.getState()
        if (state.status === 'playing') {
          return true
        }
      } catch {
        // 查询失败继续重试
      }
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
