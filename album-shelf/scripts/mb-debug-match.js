/**
 * 验证优化后的匹配策略
 * 用法: node scripts/mb-debug-match.js
 */

const { MusicBrainzApi } = require('musicbrainz-api')

const mbApi = new MusicBrainzApi({
  appName: 'AlbumShelf-Debug',
  appVersion: '1.0.0',
  appContactInfo: 'https://github.com/user/album-shelf'
})

/**
 * 复现 pickBestReleaseGroup 逻辑
 */
function extractYear(dateStr) {
  if (!dateStr) return null
  const match = dateStr.match(/^(\d{4})/)
  return match ? parseInt(match[1], 10) : null
}

function pickBestReleaseGroup(candidates, releaseDate) {
  if (candidates.length === 1) return candidates[0]

  const localYear = extractYear(releaseDate)

  const scored = candidates.map((rg) => {
    let priority = 0

    // 类型: Album(0), 其他(10)
    if (rg['primary-type'] !== 'Album') priority += 10

    // 年份匹配
    const mbYear = extractYear(rg['first-release-date'])
    if (localYear && mbYear && localYear === mbYear) {
      priority += 0
    } else if (localYear && mbYear) {
      priority += 5
    } else {
      priority += 3
    }

    const sortYear = mbYear ?? 9999
    return { rg, priority, sortYear }
  })

  scored.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.sortYear - b.sortYear
  })

  return scored[0].rg
}

async function debugMatch(title, artist, releaseDate) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`搜索: "${title}" - "${artist}" (本地日期: ${releaseDate || '无'})`)
  console.log('='.repeat(60))

  try {
    const searchResult = await mbApi.search('release-group', {
      query: { releasegroup: title, artist: artist },
      limit: 10
    })

    const releaseGroups = searchResult['release-groups']
    if (!releaseGroups || releaseGroups.length === 0) {
      console.log('❌ 未找到任何匹配结果')
      return
    }

    // 筛选 score >= 50
    const viable = releaseGroups.filter(rg => rg.score >= 50)
    console.log(`\n找到 ${releaseGroups.length} 个结果, ${viable.length} 个 score>=50:\n`)

    for (const rg of viable) {
      const artists = rg['artist-credit']?.map(ac => ac.name || ac.artist?.name).join(', ') || '?'
      console.log(`  [score=${rg.score}] "${rg.title}" by ${artists}`)
      console.log(`    type: ${rg['primary-type']}, date: ${rg['first-release-date'] || 'N/A'}, id: ${rg.id}`)
    }

    // 取同 score 候选
    const topScore = viable[0].score
    const topCandidates = viable.filter(rg => rg.score === topScore)
    console.log(`\n同 score(${topScore}) 候选: ${topCandidates.length} 个`)

    // 旧策略
    const oldPick = topCandidates[0]
    console.log(`\n旧策略选择: "${oldPick.title}" (${oldPick['primary-type']}, ${oldPick['first-release-date']})`)

    // 新策略
    const newPick = pickBestReleaseGroup(topCandidates, releaseDate)
    console.log(`新策略选择: "${newPick.title}" (${newPick['primary-type']}, ${newPick['first-release-date']})`)

    if (oldPick.id !== newPick.id) {
      console.log(`✅ 策略优化生效！选择了不同的 Release Group`)
    } else {
      console.log(`ℹ️  两种策略选择相同`)
    }

    // 获取新策略选中的详情
    const details = await mbApi.lookup('release-group', newPick.id, ['ratings', 'genres'])
    const rating = details.rating
    const genres = details.genres
    console.log(`\n新策略匹配详情:`)
    console.log(`  rating: ${rating?.value ?? 'null'} (${rating?.['votes-count'] ?? 0} votes)`)
    console.log(`  genres: ${genres?.length ? genres.map(g => g.name).join(', ') : '无'}`)

  } catch (error) {
    console.log(`❌ 请求出错:`, error.message || error)
  }
}

async function main() {
  // Wish You Were Here - 原来匹配到 2013 再版，应该匹配 1975 原版
  await debugMatch('Wish You Were Here', 'Pink Floyd', '1975-09-12')

  // 范特西 - 匹配正确，但无评分（数据覆盖度问题）
  await debugMatch('范特西', '周杰伦', '2001-09-14')

  // OK Computer - 对照组
  await debugMatch('OK Computer', 'Radiohead', '1997-06-16')
}

main().catch(console.error)