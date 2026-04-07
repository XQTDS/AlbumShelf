import { MusicBrainzApi, type IMusicBrainzConfig } from 'musicbrainz-api'

/**
 * MusicBrainz API 客户端封装
 *
 * - 配置自定义 User-Agent
 * - 支持用户名/密码认证
 * - 内置请求频率控制（1 req/s，符合 MusicBrainz 官方限制）
 */

let mbClient: MusicBrainzApi | null = null

export interface MbCredentials {
  username: string
  password: string
}

/**
 * 初始化或重新创建 MusicBrainz API 客户端
 */
export function createMbClient(credentials?: MbCredentials): MusicBrainzApi {
  const config: IMusicBrainzConfig = {
    appName: 'AlbumShelf',
    appVersion: '1.0.0',
    appContactInfo: 'https://github.com/user/album-shelf',

    // 频率控制：1 req/s，符合 MusicBrainz 官方速率限制
    rateLimit: [1, 1]
  }

  if (credentials) {
    config.botAccount = {
      username: credentials.username,
      password: credentials.password
    }
  }

  mbClient = new MusicBrainzApi(config)
  return mbClient
}

/**
 * 获取当前的 MusicBrainz API 客户端实例
 */
export function getMbClient(): MusicBrainzApi {
  if (!mbClient) {
    throw new Error('MusicBrainz 客户端未初始化。请先调用 createMbClient()。')
  }
  return mbClient
}

/**
 * 检查客户端是否已初始化
 */
export function isMbClientInitialized(): boolean {
  return mbClient !== null
}
