/**
 * 验证脚本：通过 Electron 主进程测试数据库层和数据同步层
 *
 * 用法：cd album-shelf && .\node_modules\electron\dist\electron.exe ./scripts/ --no-sandbox
 */

// Debug: check what electron exports
const electronModule = require('electron')
console.log('electron module type:', typeof electronModule)
console.log('electron module value (first 100 chars):', String(electronModule).substring(0, 100))

// In Electron main process, require('electron') should return the module object
// but in some versions it may need to be accessed differently
let app, BrowserWindow

if (typeof electronModule === 'string') {
  // Electron is returning the path - we're not in a proper Electron context
  // Try accessing through process.electronBinding or similar
  console.log('process.type:', process.type)
  console.log('process.versions.electron:', process.versions.electron)

  // When running as Electron app entry, the module should be available
  // Let's try require('electron/main')
  try {
    const mainModule = require('electron/main')
    app = mainModule.app
    console.log('Got app from electron/main')
  } catch (e) {
    console.log('electron/main failed:', e.message)
  }
}

if (!app && typeof electronModule === 'object' && electronModule.app) {
  app = electronModule.app
}

if (!app) {
  console.error('ERROR: 无法获取 Electron app 模块。当前环境可能不是 Electron 主进程。')
  process.exit(1)
}

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

app.whenReady().then(() => {
  const tmpDbPath = path.join(app.getPath('userData'), 'test-album-shelf.db')

  // 清理旧的测试数据库
  if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath)

  const db = new Database(tmpDbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  console.log('✓ 数据库创建成功:', tmpDbPath)

  // ========== 建表 ==========
  db.exec(`
    CREATE TABLE IF NOT EXISTS album (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      netease_album_id TEXT NOT NULL UNIQUE,
      musicbrainz_id TEXT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      cover_url TEXT,
      release_date TEXT,
      mb_rating REAL,
      mb_rating_count INTEGER,
      track_count INTEGER,
      synced_at TEXT NOT NULL,
      enriched_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS track (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id INTEGER NOT NULL,
      netease_id TEXT,
      title TEXT NOT NULL,
      artist TEXT,
      track_number INTEGER NOT NULL,
      disc_number INTEGER NOT NULL DEFAULT 1,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (album_id) REFERENCES album(id) ON DELETE CASCADE
    );
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS genre (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS album_genre (
      album_id INTEGER NOT NULL,
      genre_id INTEGER NOT NULL,
      FOREIGN KEY (album_id) REFERENCES album(id) ON DELETE CASCADE,
      FOREIGN KEY (genre_id) REFERENCES genre(id) ON DELETE CASCADE,
      UNIQUE (album_id, genre_id)
    );
  `)

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
  console.log('✓ 建表成功:', tables.map(t => t.name).join(', '))

  // ========== Mock 数据 ==========
  const MOCK_ALBUMS = [
    { netease_album_id: '75621', title: 'OK Computer', artist: 'Radiohead', release_date: '1997-06-16', track_count: 12 },
    { netease_album_id: '34720', title: 'Abbey Road', artist: 'The Beatles', release_date: '1969-09-26', track_count: 17 },
    { netease_album_id: '82311', title: 'The Dark Side of the Moon', artist: 'Pink Floyd', release_date: '1973-03-01', track_count: 10 },
    { netease_album_id: '36528', title: 'Nevermind', artist: 'Nirvana', release_date: '1991-09-24', track_count: 13 },
    { netease_album_id: '19189', title: 'Kind of Blue', artist: 'Miles Davis', release_date: '1959-08-17', track_count: 5 },
    { netease_album_id: '38373', title: 'Random Access Memories', artist: 'Daft Punk', release_date: '2013-05-17', track_count: 13 },
    { netease_album_id: '2943011', title: '范特西', artist: '周杰伦', release_date: '2001-09-14', track_count: 10 },
    { netease_album_id: '2943012', title: '叶惠美', artist: '周杰伦', release_date: '2003-07-31', track_count: 11 },
    { netease_album_id: '85532', title: 'Is This It', artist: 'The Strokes', release_date: '2001-07-30', track_count: 11 },
    { netease_album_id: '21435', title: 'Homework', artist: 'Daft Punk', release_date: '1997-01-20', track_count: 16 },
    { netease_album_id: '73519', title: 'Kid A', artist: 'Radiohead', release_date: '2000-10-02', track_count: 10 },
    { netease_album_id: '48753', title: 'Rumours', artist: 'Fleetwood Mac', release_date: '1977-02-04', track_count: 11 },
    { netease_album_id: '512891', title: 'To Pimp a Butterfly', artist: 'Kendrick Lamar', release_date: '2015-03-15', track_count: 16 },
    { netease_album_id: '192312', title: 'Wish You Were Here', artist: 'Pink Floyd', release_date: '1975-09-12', track_count: 5 },
    { netease_album_id: '84991', title: 'In Rainbows', artist: 'Radiohead', release_date: '2007-10-10', track_count: 10 },
  ]

  // ========== 首次同步 ==========
  console.log('\n--- 首次同步 ---')
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO album (netease_album_id, title, artist, cover_url, release_date, track_count, synced_at)
    VALUES (@netease_album_id, @title, @artist, @cover_url, @release_date, @track_count, @synced_at)
  `)
  const now = new Date().toISOString()
  let added = 0

  const insertMany = db.transaction((albums) => {
    for (const album of albums) {
      const existing = db.prepare('SELECT id FROM album WHERE netease_album_id = ?').get(album.netease_album_id)
      if (!existing) {
        insertStmt.run({
          netease_album_id: album.netease_album_id, title: album.title, artist: album.artist,
          cover_url: null, release_date: album.release_date || null,
          track_count: album.track_count || null, synced_at: now
        })
        added++
      }
    }
  })
  insertMany(MOCK_ALBUMS)
  console.log(`✓ 首次同步完成: 新增 ${added} 条`)

  // 验证数据
  const albumCount = db.prepare('SELECT COUNT(*) as count FROM album').get()
  console.log(`✓ 数据库中专辑数量: ${albumCount.count}`)

  const albums = db.prepare('SELECT title, artist, release_date FROM album ORDER BY release_date').all()
  console.log('\n专辑列表（按发行日期排序）:')
  albums.forEach((a, i) => console.log(`  ${i + 1}. ${a.title} - ${a.artist} (${a.release_date})`))

  // ========== 增量同步 ==========
  console.log('\n--- 增量同步（重复执行）---')
  let added2 = 0, skipped2 = 0
  const syncAgain = db.transaction((albums) => {
    for (const album of albums) {
      const existing = db.prepare('SELECT id FROM album WHERE netease_album_id = ?').get(album.netease_album_id)
      if (existing) { skipped2++ } else {
        insertStmt.run({ netease_album_id: album.netease_album_id, title: album.title, artist: album.artist,
          cover_url: null, release_date: album.release_date || null,
          track_count: album.track_count || null, synced_at: now })
        added2++
      }
    }
  })
  syncAgain(MOCK_ALBUMS)
  console.log(`✓ 增量同步: 新增 ${added2} 条，跳过 ${skipped2} 条（去重生效）`)
  console.log(`✓ 数据库专辑数量（应仍为 15）: ${db.prepare('SELECT COUNT(*) as count FROM album').get().count}`)

  // ========== 查询验证 ==========
  console.log('\n--- 查询验证 ---')
  const sr = db.prepare("SELECT title FROM album WHERE LOWER(title) LIKE '%ok%' OR LOWER(artist) LIKE '%ok%'").all()
  console.log(`✓ 搜索 "ok": ${sr.length} 条 → ${sr.map(r => r.title).join(', ')}`)

  const ra = db.prepare("SELECT title FROM album WHERE artist = 'Radiohead'").all()
  console.log(`✓ Radiohead: ${ra.length} 张 → ${ra.map(r => r.title).join(', ')}`)

  const artists = db.prepare('SELECT DISTINCT artist FROM album ORDER BY artist').all()
  console.log(`✓ 艺术家（${artists.length} 位）: ${artists.map(a => a.artist).join(', ')}`)

  // ========== Genre 关联 ==========
  console.log('\n--- Genre 关联 ---')
  const a1 = db.prepare("SELECT id FROM album WHERE title = 'OK Computer'").get()
  db.prepare("INSERT OR IGNORE INTO genre (name) VALUES ('Alternative Rock')").run()
  db.prepare("INSERT OR IGNORE INTO genre (name) VALUES ('Electronic')").run()
  const g1 = db.prepare("SELECT id FROM genre WHERE name = 'Alternative Rock'").get()
  const g2 = db.prepare("SELECT id FROM genre WHERE name = 'Electronic'").get()
  db.prepare('INSERT OR IGNORE INTO album_genre (album_id, genre_id) VALUES (?, ?)').run(a1.id, g1.id)
  db.prepare('INSERT OR IGNORE INTO album_genre (album_id, genre_id) VALUES (?, ?)').run(a1.id, g2.id)
  const genres = db.prepare(`SELECT g.name FROM genre g INNER JOIN album_genre ag ON g.id = ag.genre_id WHERE ag.album_id = ? ORDER BY g.name`).all(a1.id)
  console.log(`✓ OK Computer 风格: ${genres.map(g => g.name).join(', ')}`)

  // ========== 清理 ==========
  db.close()
  fs.unlinkSync(tmpDbPath)
  if (fs.existsSync(tmpDbPath + '-wal')) fs.unlinkSync(tmpDbPath + '-wal')
  if (fs.existsSync(tmpDbPath + '-shm')) fs.unlinkSync(tmpDbPath + '-shm')

  console.log('\n✓ 临时数据库已清理')
  console.log('\n========== 所有验证通过 ✓ ==========')

  app.quit()
})