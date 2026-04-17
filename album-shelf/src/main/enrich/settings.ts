import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * 应用设置管理
 *
 * 设置存储在 userData 目录下的 settings.json 文件中。
 * 采用 top-level namespace 设计，方便未来扩展其他设置项。
 */

const SETTINGS_FILE = 'settings.json'

/**
 * 匹配策略开关配置
 */
export interface EnrichStrategies {
  /** Q1: 完整标题 + 完整艺术家 */
  Q1_fullTitleFullArtist: boolean
  /** Q2: 完整标题 + 第一个艺术家 */
  Q2_fullTitleFirstArtist: boolean
  /** Q3: 标题首词 + 第一个艺术家 */
  Q3_titleFirstWordFirstArtist: boolean
  /** F1: 去除标题中的艺术家名前缀 */
  F1_removeArtistPrefix: boolean
  /** F2: 去除标题末尾的括号后缀 */
  F2_removeParenSuffix: boolean
  /** F3: Lucene 分词搜索 */
  F3_luceneTokenSearch: boolean
}

/**
 * 应用设置结构
 */
export interface AppSettings {
  enrichStrategies?: Partial<EnrichStrategies>
}

/**
 * 所有策略默认值（全部开启）
 */
const DEFAULT_STRATEGIES: EnrichStrategies = {
  Q1_fullTitleFullArtist: true,
  Q2_fullTitleFirstArtist: true,
  Q3_titleFirstWordFirstArtist: true,
  F1_removeArtistPrefix: true,
  F2_removeParenSuffix: true,
  F3_luceneTokenSearch: true
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

/**
 * 加载应用设置
 *
 * 文件不存在时返回空对象（使用默认值），不自动创建文件。
 */
export function loadSettings(): AppSettings {
  const filePath = getSettingsPath()

  if (!existsSync(filePath)) {
    return {}
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as AppSettings
  } catch (error) {
    console.error('读取设置文件失败:', error)
    return {}
  }
}

/**
 * 保存应用设置
 */
export function saveSettings(settings: AppSettings): void {
  try {
    writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch (error) {
    console.error('写入设置文件失败:', error)
  }
}

/**
 * 获取匹配策略开关状态
 *
 * 缺失的策略项使用默认值（true）
 */
export function getEnrichStrategies(): EnrichStrategies {
  const settings = loadSettings()
  const partial = settings.enrichStrategies ?? {}

  return {
    ...DEFAULT_STRATEGIES,
    ...partial
  }
}