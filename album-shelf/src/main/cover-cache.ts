import { app, net, protocol } from 'electron'
import { createHash } from 'crypto'
import { join, extname } from 'path'
import { mkdirSync, existsSync, readdirSync, writeFileSync, unlinkSync, renameSync } from 'fs'
import { pathToFileURL } from 'url'
import { AlbumService } from './album-service'

// ==================== 封面本地缓存 ====================
// 渲染层通过 cover://album/<albumId> 加载封面：
//   缓存命中 → 直接读盘返回；未命中 → 下载写盘后返回；失败 → 404 由渲染层回退远程 URL。

// 注册必须在 app ready 之前完成，因此在模块顶层执行（本模块由 index.ts 最先 import）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cover',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

// 可识别的图片扩展名，URL 无后缀时回退 .jpg
const CACHE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

// 下载超时：避免网络异常时请求悬挂
const DOWNLOAD_TIMEOUT_MS = 15_000

function cacheDir(): string {
  return join(app.getPath('userData'), 'covers')
}

/**
 * 计算封面缓存路径：<albumId>_<urlHash>.<ext>
 * 哈希取自 cover_url，URL 变化后自然指向新文件，旧文件由写入时的清理逻辑移除。
 */
function cachePath(albumId: number, coverUrl: string): string {
  const hash = createHash('sha1').update(coverUrl).digest('hex').slice(0, 12)
  let ext = extname(new URL(coverUrl).pathname).toLowerCase()
  if (!CACHE_EXTENSIONS.has(ext)) {
    ext = '.jpg'
  }
  return join(cacheDir(), `${albumId}_${hash}${ext}`)
}

/**
 * 清理同一专辑的其他缓存文件（封面 URL 变更后残留的旧文件）。
 */
function pruneStaleCovers(albumId: number, keepPath: string): void {
  try {
    const prefix = `${albumId}_`
    for (const name of readdirSync(cacheDir())) {
      if (name.startsWith(prefix)) {
        const stalePath = join(cacheDir(), name)
        if (stalePath !== keepPath) {
          unlinkSync(stalePath)
        }
      }
    }
  } catch {
    // 目录不存在等场景忽略，缓存清理失败不影响主流程
  }
}

function notFound(): Response {
  return new Response(null, { status: 404 })
}

function serveFile(filePath: string): Promise<Response> {
  return net.fetch(pathToFileURL(filePath).toString())
}

// 同专辑的进行中下载去重：列表与详情面板并发请求同一封面时只下载一次
const pendingDownloads = new Map<number, Promise<Response>>()

/**
 * 注册 cover:// 协议处理器。
 * 需在 app ready 后、数据库初始化完成后调用。
 */
export function registerCoverProtocol(): void {
  const albumService = new AlbumService()

  protocol.handle('cover', async (request) => {
    try {
      // URL 格式：cover://album/<albumId>
      const albumId = Number(new URL(request.url).pathname.replace(/^\//, ''))
      if (!Number.isInteger(albumId) || albumId <= 0) {
        return notFound()
      }

      const coverUrl = albumService.getCoverUrlById(albumId)
      if (!coverUrl) {
        return notFound()
      }

      const filePath = cachePath(albumId, coverUrl)
      if (existsSync(filePath)) {
        return await serveFile(filePath)
      }

      const pending = pendingDownloads.get(albumId)
      if (pending) {
        return await pending
      }

      const download = (async (): Promise<Response> => {
        // 历史数据中可能存在 http 开头的 URL，统一走 https
        const httpsUrl = coverUrl.replace(/^http:\/\//, 'https://')
        const resp = await net.fetch(httpsUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
        if (!resp.ok) {
          console.warn(`封面下载失败 (${resp.status}): ${httpsUrl}`)
          return notFound()
        }

        const body = Buffer.from(await resp.arrayBuffer())
        mkdirSync(cacheDir(), { recursive: true })
        // 先写临时文件再 rename，避免中途崩溃留下损坏的半截图片被长期当作缓存命中
        const tmpPath = `${filePath}.tmp`
        writeFileSync(tmpPath, body)
        renameSync(tmpPath, filePath)
        pruneStaleCovers(albumId, filePath)

        const contentType = resp.headers.get('Content-Type') ?? 'image/jpeg'
        return new Response(body, { headers: { 'Content-Type': contentType } })
      })().finally(() => {
        pendingDownloads.delete(albumId)
      })

      pendingDownloads.set(albumId, download)
      return await download
    } catch (error) {
      console.error('cover:// 请求处理失败:', error)
      return notFound()
    }
  })
}
