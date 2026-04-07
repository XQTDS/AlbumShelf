import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// ==================== Types ====================

/** ncm-cli 标准 JSON 返回结构 */
interface NcmCliResponse<T> {
  code: number
  subCode: string | null
  message: string | null
  data: T
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

// ==================== NcmCliService ====================

const NCM_CLI_TIMEOUT = 15_000 // 15 seconds

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

    try {
      const { stdout } = await execFileAsync('ncm-cli', fullArgs, {
        timeout: NCM_CLI_TIMEOUT,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large track lists
        windowsHide: true,
        shell: true // Windows 上需要通过 shell 执行 .cmd 文件
      })

      // ncm-cli 输出可能包含非 JSON 前缀行（如 "Command executed successfully."）
      // 需要找到 JSON 起始位置
      const jsonStart = stdout.indexOf('{')
      if (jsonStart === -1) {
        throw new Error(`ncm-cli 返回了非 JSON 内容: ${stdout.substring(0, 200)}`)
      }

      const jsonStr = stdout.substring(jsonStart)
      const response: NcmCliResponse<T> = JSON.parse(jsonStr)

      if (response.code !== 200) {
        throw new Error(
          `ncm-cli 业务错误 (code: ${response.code}): ${response.message || '未知错误'}`
        )
      }

      return response.data
    } catch (error: unknown) {
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
}