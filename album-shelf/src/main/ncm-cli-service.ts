import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

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

/**
 * NcmCliService - 封装 ncm-cli 命令行工具调用
 *
 * 通过 child_process.execFile 调用全局安装的 ncm-cli，
 * 固定 --output json 参数，解析返回的 JSON。
 */
export class NcmCliService {
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
      const { stdout, stderr } = await execFileAsync('ncm-cli', fullArgs, {
        timeout: NCM_CLI_TIMEOUT,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large track lists
        windowsHide: true,
        shell: true // Windows 上需要通过 shell 执行 .cmd 文件
      })

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
        // 命令不存在
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error('ncm-cli 未安装或不在 PATH 中，请确认已全局安装 ncm-cli')
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
      const { stdout, stderr } = await execFileAsync('ncm-cli', fullArgs, {
        timeout: NCM_CLI_TIMEOUT,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        shell: true
      })

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
          throw new Error('ncm-cli 未安装或不在 PATH 中，请确认已全局安装 ncm-cli')
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
    return (response as { state: { status: string } }).state ?? { status: 'unknown' }
  }

  /**
   * 等待播放器进入 playing 状态
   * @param maxWaitMs 最大等待时间（毫秒），默认 10 秒
   * @param intervalMs 轮询间隔（毫秒），默认 500ms
   */
  async waitForPlaying(maxWaitMs = 10_000, intervalMs = 500): Promise<boolean> {
    const start = Date.now()
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

      const { stdout, stderr } = await execFileAsync('ncm-cli', fullArgs, {
        timeout: NCM_CLI_TIMEOUT,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        shell: true
      })

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

    const { stdout, stderr } = await execFileAsync('ncm-cli', fullArgs, {
      timeout: NCM_CLI_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      shell: true
    })

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

    const { stdout, stderr } = await execFileAsync('ncm-cli', fullArgs, {
      timeout: NCM_CLI_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      shell: true
    })

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
