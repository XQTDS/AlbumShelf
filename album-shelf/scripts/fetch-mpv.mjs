/**
 * 拉取 mpv Windows 二进制到 build/mpv/，供开发播放与打包（win.extraResources）使用
 *
 * 用法：npm run fetch-mpv
 *
 * - 版本与校验值固定在 build/mpv-manifest.json（zhongfly/mpv-winbuild 快照）
 * - 幂等：build/mpv/mpv.exe 已存在且大小与 manifest 一致时直接跳过
 * - 非 win32 平台直接跳过（mac 不捆绑 mpv，走 brew 安装）
 * - 任何失败（网络、SHA256 不匹配、解压异常）以非零退出码结束，
 *   CI 依赖此行为中止 Windows 构建，避免产出无 mpv 的安装包
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, copyFileSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sevenBin from '7zip-bin'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const buildDir = resolve(scriptDir, '..', 'build')
const destDir = join(buildDir, 'mpv')
const manifestPath = join(buildDir, 'mpv-manifest.json')

function fail(message) {
  console.error(`[fetch-mpv] 失败: ${message}`)
  process.exit(1)
}

function sha256Of(filePath) {
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}

async function download(url, destPath) {
  console.log(`[fetch-mpv] 下载 ${url}`)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  writeFileSync(destPath, buffer)
  return buffer.length
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('[fetch-mpv] 非 Windows 平台，跳过（mac 使用 brew install mpv）')
    return
  }
  if (!existsSync(manifestPath)) {
    fail(`manifest 缺失: ${manifestPath}`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  // 幂等：mpv.exe 已就位且大小一致则跳过（强制重拉需手动删除 build/mpv）
  const targetExe = join(destDir, 'mpv.exe')
  if (existsSync(targetExe)) {
    const { size } = await import('node:fs').then((fs) => fs.statSync(targetExe))
    if (manifest.expectedExeSize && size === manifest.expectedExeSize) {
      console.log(`[fetch-mpv] ${targetExe} 已存在（${size} 字节），跳过`)
      return
    }
    console.log(`[fetch-mpv] 现有 mpv.exe 大小不符（${size} != ${manifest.expectedExeSize}），重新拉取`)
  }

  const baseUrl = `https://github.com/zhongfly/mpv-winbuild/releases/download/${manifest.tag}`
  const workDir = join(tmpdir(), `fetch-mpv-${Date.now()}`)
  mkdirSync(workDir, { recursive: true })

  try {
    // 1. 下载 7z 并校验 SHA256（与同 release 的 sha256.txt 一致）
    const archivePath = join(workDir, manifest.asset)
    await download(`${baseUrl}/${manifest.asset}`, archivePath)
    const actualSha = sha256Of(archivePath)
    if (actualSha !== manifest.sha256) {
      fail(`SHA256 不匹配: 期望 ${manifest.sha256}，实际 ${actualSha}`)
    }
    console.log('[fetch-mpv] SHA256 校验通过')

    // 2. 解压（7zip-bin 自带 7za，不依赖系统 7-Zip）
    const extractDir = join(workDir, 'extract')
    mkdirSync(extractDir, { recursive: true })
    const result = spawnSync(sevenBin.path7za, ['x', archivePath, `-o${extractDir}`, '-y'], {
      stdio: 'pipe'
    })
    if (result.status !== 0) {
      fail(`解压失败: ${String(result.stderr).slice(0, 500)}`)
    }

    // 3. 拷贝运行时需要的文件（mpv.exe 主程序、mpv.com 控制台包装、fonts.conf 字幕字体配置）
    mkdirSync(destDir, { recursive: true })
    mkdirSync(join(destDir, 'mpv'), { recursive: true })
    copyFileSync(join(extractDir, 'mpv.exe'), join(destDir, 'mpv.exe'))
    copyFileSync(join(extractDir, 'mpv.com'), join(destDir, 'mpv.com'))
    copyFileSync(join(extractDir, 'mpv', 'fonts.conf'), join(destDir, 'mpv', 'fonts.conf'))

    // 4. 归档内不含 LICENSE，从 mpv 官方仓库按同一提交拉取（GPL 仅捆绑分发）
    if (manifest.licenseUrl) {
      const licensePath = join(destDir, 'LICENSE.txt')
      try {
        await download(manifest.licenseUrl, licensePath)
      } catch (error) {
        console.warn(`[fetch-mpv] LICENSE 下载失败（不影响功能）: ${error.message}`)
      }
    }

    console.log(`[fetch-mpv] 完成: ${destDir}`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main().catch((error) => fail(error.message))
