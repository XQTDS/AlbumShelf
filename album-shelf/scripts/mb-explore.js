/**
 * 探索 MusicBrainz API 返回的字段结构
 * 以 Radiohead - OK Computer 为例
 *
 * 用法: node scripts/mb-explore.js
 */

const { MusicBrainzApi } = require('musicbrainz-api')

const mbApi = new MusicBrainzApi({
  appName: 'AlbumShelf-Explore',
  appVersion: '1.0.0',
  appContactInfo: 'https://github.com/user/album-shelf'
})

async function main() {
  console.log('=== 1. 搜索 Release Group: Radiohead - OK Computer ===\n')

  const searchResult = await mbApi.search('release-group', {
    query: { releasegroup: 'OK Computer', artist: 'Radiohead' },
    limit: 3
  })

  const releaseGroups = searchResult['release-groups']
  if (!releaseGroups || releaseGroups.length === 0) {
    console.log('未找到匹配结果')
    return
  }

  // 打印搜索结果概览
  for (const rg of releaseGroups) {
    console.log(`  - [score=${rg.score}] ${rg.title} (${rg.id})`)
    console.log(`    type: ${rg['primary-type']}, artist: ${rg['artist-credit']?.[0]?.name}`)
    if (rg.tags) console.log(`    tags (search): ${JSON.stringify(rg.tags)}`)
    if (rg.genres) console.log(`    genres (search): ${JSON.stringify(rg.genres)}`)
  }

  const bestId = releaseGroups[0].id
  console.log(`\n最佳匹配 MBID: ${bestId}\n`)

  // === 2. lookup 带 tags ===
  console.log('=== 2. Lookup with [tags] ===\n')
  const detailWithTags = await mbApi.lookup('release-group', bestId, ['tags'])
  console.log('Keys:', Object.keys(detailWithTags))
  console.log('tags:', JSON.stringify(detailWithTags.tags, null, 2))
  console.log('genres:', JSON.stringify(detailWithTags.genres, null, 2))
  console.log()

  // === 3. lookup 带 genres ===
  console.log('=== 3. Lookup with [genres] ===\n')
  const detailWithGenres = await mbApi.lookup('release-group', bestId, ['genres'])
  console.log('Keys:', Object.keys(detailWithGenres))
  console.log('tags:', JSON.stringify(detailWithGenres.tags, null, 2))
  console.log('genres:', JSON.stringify(detailWithGenres.genres, null, 2))
  console.log()

  // === 4. lookup 带 tags + genres + ratings ===
  console.log('=== 4. Lookup with [tags, genres, ratings] ===\n')
  const detailFull = await mbApi.lookup('release-group', bestId, ['tags', 'genres', 'ratings'])
  console.log('Keys:', Object.keys(detailFull))
  console.log('rating:', JSON.stringify(detailFull.rating, null, 2))
  console.log('tags:', JSON.stringify(detailFull.tags, null, 2))
  console.log('genres:', JSON.stringify(detailFull.genres, null, 2))
  console.log()

  // === 5. 直接用 fetch 调原始 API 看完整 JSON ===
  console.log('=== 5. Raw HTTP fetch (tags+genres+ratings) ===\n')
  const url = `https://musicbrainz.org/ws/2/release-group/${bestId}?inc=tags+genres+ratings&fmt=json`
  console.log('URL:', url)
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'AlbumShelf-Explore/1.0.0 (https://github.com/user/album-shelf)' }
  })
  const raw = await resp.json()
  console.log('\n--- Full raw response ---')
  console.log(JSON.stringify(raw, null, 2))
}

main().catch(console.error)
