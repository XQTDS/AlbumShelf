import { parse } from 'csv-parse/sync'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface CsvAlbum {
  title: string
  artist: string
  netease_id?: string
}

/**
 * 获取 CSV 文件路径
 * 默认为项目根目录下的 data/album-collection.csv
 */
export function getCsvPath(): string {
  // 在开发环境下，app.getAppPath() 返回 album-shelf 目录
  // CSV 文件位于项目根目录的 data 文件夹中
  const appPath = app.getAppPath()
  // 从 album-shelf 往上一层到 AlbumShelf 根目录
  return join(appPath, '..', 'data', 'album-collection.csv')
}

/**
 * 从 CSV 文件读取专辑列表
 */
export function readAlbumsFromCsv(csvPath?: string): CsvAlbum[] {
  const filePath = csvPath || getCsvPath()

  if (!existsSync(filePath)) {
    throw new Error(`CSV 文件不存在: ${filePath}`)
  }

  const content = readFileSync(filePath, 'utf-8')

  const records = parse(content, {
    columns: true, // 使用第一行作为列名
    skip_empty_lines: true,
    trim: true
  }) as Array<{ title: string; artist: string; netease_id: string }>

  return records.map((record) => ({
    title: record.title,
    artist: record.artist,
    netease_id: record.netease_id || undefined
  }))
}