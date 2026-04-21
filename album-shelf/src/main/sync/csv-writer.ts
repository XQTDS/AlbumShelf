import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { getCsvPath } from './csv-reader'

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

/**
 * 更新 CSV 中单个专辑的标题和 netease_id
 * 用于确认模糊匹配后更新专辑名
 * @param originalTitle 原始专辑名（用于定位记录）
 * @param artist 艺术家名（用于定位记录）
 * @param newTitle 新的专辑名
 * @param neteaseId 网易云专辑 ID
 * @param csvPath 可选的 CSV 文件路径
 */
export function updateAlbumTitleInCsv(
  originalTitle: string,
  artist: string,
  newTitle: string,
  neteaseId: string,
  csvPath?: string
): void {
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

  // 查找并更新记录
  let found = false
  const updatedRecords = records.map((record) => {
    if (record.title === originalTitle && record.artist === artist) {
      found = true
      return {
        ...record,
        title: newTitle,
        netease_id: neteaseId
      }
    }
    return record
  })

  if (!found) {
    console.warn(`CSV 中未找到专辑: ${originalTitle} - ${artist}`)
    return
  }

  // 写回 CSV
  const output = stringify(updatedRecords, {
    header: true,
    columns: ['title', 'artist', 'netease_id']
  })

  writeFileSync(filePath, output, 'utf-8')

  console.log(`CSV 已更新专辑名: "${originalTitle}" -> "${newTitle}"`)
}

/**
 * 追加单张专辑到 CSV 文件
 * 用于搜索添加场景
 * @param album 要追加的专辑信息
 * @param csvPath 可选的 CSV 文件路径
 */
export function appendAlbumToCsv(
  album: AlbumWithNeteaseId,
  csvPath?: string
): void {
  const filePath = csvPath || getCsvPath()

  // 如果文件不存在，创建带表头的新文件
  if (!existsSync(filePath)) {
    // 确保目录存在
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // 创建带表头的新 CSV 文件
    const output = stringify([album], {
      header: true,
      columns: ['title', 'artist', 'netease_id']
    })
    writeFileSync(filePath, output, 'utf-8')
    console.log(`CSV 文件已创建: ${filePath}`)
    return
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

  // 追加新记录
  records.push({
    title: album.title,
    artist: album.artist,
    netease_id: album.netease_id
  })

  // 写回 CSV
  const output = stringify(records, {
    header: true,
    columns: ['title', 'artist', 'netease_id']
  })

  writeFileSync(filePath, output, 'utf-8')

  console.log(`CSV 已追加专辑: "${album.title}" - ${album.artist}`)
  console.log(`备份文件: ${backupPath}`)
}

/**
 * 更新 CSV 中已有专辑的 netease_id（ID 修复场景）
 * 通过 title + artist 定位行，更新其 netease_id 字段为新值
 * @param title 专辑名（用于定位记录）
 * @param artist 艺术家名（用于定位记录）
 * @param newNeteaseId 新的网易云专辑 ID
 * @param csvPath 可选的 CSV 文件路径
 */
export function updateNeteaseIdInCsv(
  title: string,
  artist: string,
  newNeteaseId: string,
  csvPath?: string
): void {
  const filePath = csvPath || getCsvPath()

  if (!existsSync(filePath)) {
    console.warn(`CSV 文件不存在，跳过回写: ${filePath}`)
    return
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

  // 查找并更新第一条匹配的记录
  let found = false
  const updatedRecords = records.map((record) => {
    if (!found && record.title === title && record.artist === artist) {
      found = true
      return { ...record, netease_id: newNeteaseId }
    }
    return record
  })

  if (!found) {
    console.warn(`CSV 中未找到专辑: "${title}" - ${artist}，跳过回写`)
    return
  }

  // 写回 CSV
  const output = stringify(updatedRecords, {
    header: true,
    columns: ['title', 'artist', 'netease_id']
  })

  writeFileSync(filePath, output, 'utf-8')

  console.log(`CSV 已更新 netease_id: "${title}" - ${artist} -> ${newNeteaseId}`)
}
