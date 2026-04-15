import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs'
import { getCsvPath, CsvAlbum } from './csv-reader'

export interface AlbumWithNeteaseId {
  title: string
  artist: string
  netease_id: string
}

/**
 * 将 netease_id 回写到 CSV 文件
 * @param albums 包含 netease_id 的专辑列表
 * @param csvPath 可选的 CSV 文件路径
 */
export function writeNeteaseIdsToCsv(albums: AlbumWithNeteaseId[], csvPath?: string): void {
  const filePath = csvPath || getCsvPath()

  if (!existsSync(filePath)) {
    throw new Error(`CSV 文件不存在: ${filePath}`)
  }

  // 备份原文件
  const backupPath = filePath + '.bak'
  copyFileSync(filePath, backupPath)

  // 读取现有 CSV
  const content = readFileSync(filePath, 'utf-8')
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Array<{ title: string; artist: string; netease_id: string }>

  // 创建查找映射：title+artist -> netease_id
  const idMap = new Map<string, string>()
  for (const album of albums) {
    const key = `${album.title}|||${album.artist}`
    idMap.set(key, album.netease_id)
  }

  // 更新记录
  let updatedCount = 0
  const updatedRecords = records.map((record) => {
    const key = `${record.title}|||${record.artist}`
    const newId = idMap.get(key)

    if (newId && !record.netease_id) {
      updatedCount++
      return { ...record, netease_id: newId }
    }
    return record
  })

  // 写回 CSV
  const output = stringify(updatedRecords, {
    header: true,
    columns: ['title', 'artist', 'netease_id']
  })

  writeFileSync(filePath, output, 'utf-8')

  console.log(`CSV 更新完成: ${updatedCount} 条记录已写入 netease_id`)
  console.log(`备份文件: ${backupPath}`)
}
