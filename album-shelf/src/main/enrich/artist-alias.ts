import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const ALIASES_FILENAME = 'artist-aliases.json'

/**
 * 种子文件路径（代码仓库内，仅用于首次初始化）
 */
const SEED_FILE = join(__dirname, ALIASES_FILENAME)

/**
 * 获取 userData 下的别名文件路径（实际读写位置）
 */
function getAliasesFilePath(): string {
  return join(app.getPath('userData'), ALIASES_FILENAME)
}

/**
 * 运行时别名缓存
 */
let aliasMap: Map<string, string[]> | null = null

/**
 * 从 artist-aliases.json 加载别名到内存 Map
 */
export function loadAliases(): Map<string, string[]> {
  if (aliasMap) return aliasMap

  const aliasesFile = getAliasesFilePath()

  try {
    if (existsSync(aliasesFile)) {
      const raw = readFileSync(aliasesFile, 'utf-8')
      const data = JSON.parse(raw) as Record<string, string[]>
      aliasMap = new Map(Object.entries(data))
    } else {
      // userData 中尚不存在，尝试从种子文件拷贝
      if (existsSync(SEED_FILE)) {
        copyFileSync(SEED_FILE, aliasesFile)
        const raw = readFileSync(aliasesFile, 'utf-8')
        const data = JSON.parse(raw) as Record<string, string[]>
        aliasMap = new Map(Object.entries(data))
        console.log(`已从种子文件初始化别名: ${SEED_FILE} → ${aliasesFile}`)
      } else {
        writeFileSync(aliasesFile, '{}', 'utf-8')
        aliasMap = new Map()
      }
    }
  } catch (error) {
    console.error('加载别名文件失败:', error)
    aliasMap = new Map()
  }

  return aliasMap
}

/**
 * 查找某个艺术家的所有别名
 *
 * @param artist 本地艺术家名
 * @returns 别名列表，无别名则返回空数组
 */
export function getAliases(artist: string): string[] {
  const map = loadAliases()
  return map.get(artist) ?? []
}

/**
 * 追加一个新别名，去重后同步写回文件
 *
 * @param artist 本地艺术家名
 * @param alias 要追加的别名
 * @returns true 表示新增了别名，false 表示已存在未新增
 */
export function addAlias(artist: string, alias: string): boolean {
  const map = loadAliases()
  const existing = map.get(artist) ?? []

  // 去重：忽略大小写和首尾空格比较
  const normalizedAlias = alias.trim().toLowerCase()
  const alreadyExists = existing.some((a) => a.trim().toLowerCase() === normalizedAlias)

  if (alreadyExists) {
    return false
  }

  existing.push(alias.trim())
  map.set(artist, existing)

  // 同步写回文件
  const aliasesFile = getAliasesFilePath()
  try {
    const data: Record<string, string[]> = Object.fromEntries(map)
    writeFileSync(aliasesFile, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error('写入别名文件失败:', error)
  }

  return true
}

/**
 * 重新从文件加载别名（清除缓存）
 */
export function reloadAliases(): Map<string, string[]> {
  aliasMap = null
  return loadAliases()
}