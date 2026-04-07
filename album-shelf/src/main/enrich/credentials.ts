import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { MbCredentials } from './mb-client'

/**
 * MusicBrainz 凭据管理
 *
 * 使用 Electron safeStorage API 加密存储用户名和密码。
 * 凭据保存在 userData 目录下的 mb-credentials.json 文件中。
 */

const CREDENTIALS_FILE = 'mb-credentials.json'

interface EncryptedCredentials {
  username: string // base64 encoded encrypted string
  password: string // base64 encoded encrypted string
}

function getCredentialsPath(): string {
  return join(app.getPath('userData'), CREDENTIALS_FILE)
}

/**
 * 保存 MusicBrainz 凭据（加密存储）
 */
export function saveCredentials(credentials: MbCredentials): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密服务不可用，无法安全存储凭据。')
  }

  const encrypted: EncryptedCredentials = {
    username: safeStorage.encryptString(credentials.username).toString('base64'),
    password: safeStorage.encryptString(credentials.password).toString('base64')
  }

  writeFileSync(getCredentialsPath(), JSON.stringify(encrypted, null, 2), 'utf-8')
}

/**
 * 读取 MusicBrainz 凭据（解密）
 */
export function loadCredentials(): MbCredentials | null {
  const filePath = getCredentialsPath()

  if (!existsSync(filePath)) {
    return null
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密服务不可用，无法读取加密凭据。')
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const encrypted: EncryptedCredentials = JSON.parse(raw)

    return {
      username: safeStorage.decryptString(Buffer.from(encrypted.username, 'base64')),
      password: safeStorage.decryptString(Buffer.from(encrypted.password, 'base64'))
    }
  } catch (error) {
    console.error('读取 MusicBrainz 凭据失败:', error)
    return null
  }
}

/**
 * 检查是否已配置凭据
 */
export function hasCredentials(): boolean {
  return existsSync(getCredentialsPath())
}

/**
 * 删除凭据文件
 */
export function clearCredentials(): void {
  const filePath = getCredentialsPath()
  if (existsSync(filePath)) {
    const { unlinkSync } = require('fs')
    unlinkSync(filePath)
  }
}
