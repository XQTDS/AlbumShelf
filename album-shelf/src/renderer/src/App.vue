<template>
  <div class="app">
    <!-- 顶部工具栏 -->
    <header class="toolbar">
      <div class="toolbar-left">
        <h1 class="logo">📀 AlbumShelf</h1>
      </div>
      <div class="toolbar-center">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索专辑名或艺术家..."
            class="search-input"
            @input="debouncedSearch"
          />
          <button v-if="searchQuery" class="search-clear" @click="clearSearch">✕</button>
        </div>
        <select v-model="selectedArtist" class="filter-select" @change="applyFilters">
          <option value="">全部艺术家</option>
          <option v-for="artist in artists" :key="artist" :value="artist">{{ artist }}</option>
        </select>
        <select v-model="selectedGenre" class="filter-select" @change="applyFilters">
          <option value="">全部风格</option>
          <option v-for="genre in genres" :key="genre" :value="genre">{{ genre }}</option>
        </select>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-primary" :disabled="syncing" @click="handleSync">
          <span v-if="syncing" class="spinner"></span>
          {{ syncing ? '同步中...' : '🔄 同步' }}
        </button>
      </div>
    </header>

    <!-- 补全进度条 -->
    <div v-if="enrichProgress" class="enrich-bar">
      <div class="enrich-bar-inner">
        <span class="enrich-text">正在补全 {{ enrichProgress.current }}/{{ enrichProgress.total }}：{{ enrichProgress.albumTitle }}</span>
        <div class="enrich-progress-track">
          <div class="enrich-progress-fill" :style="{ width: (enrichProgress.current / enrichProgress.total * 100) + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 提示信息 -->
    <div v-if="message" class="message-bar" :class="messageType">
      <span>{{ message }}</span>
      <button class="message-close" @click="message = ''">✕</button>
    </div>

    <!-- 表格区域 -->
    <main class="table-container" v-if="albums.length > 0">
      <table class="album-table">
        <thead>
          <tr>
            <th class="col-index">#</th>
            <th class="col-title">专辑</th>
            <th class="col-artist">艺术家</th>
            <th class="col-rating sortable" @click="toggleSort('mb_rating')">
              评分
              <span class="sort-arrow" v-if="sortBy === 'mb_rating'">{{ sortOrder === 'desc' ? '▼' : '▲' }}</span>
            </th>
            <th class="col-genre">风格</th>
            <th class="col-date sortable" @click="toggleSort('release_date')">
              发行日期
              <span class="sort-arrow" v-if="sortBy === 'release_date'">{{ sortOrder === 'desc' ? '▼' : '▲' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(album, index) in albums" :key="album.id">
            <tr
              class="album-row"
              :class="{ 'row-expanded': expandedAlbumId === album.id }"
              @click="toggleExpand(album.id)"
            >
              <td class="col-index">{{ (currentPage - 1) * pageSize + index + 1 }}</td>
              <td class="col-title">
                <div class="album-title-cell">
                  <button
                    class="btn-play btn-play-album"
                    title="播放整张专辑"
                    @click.stop="handlePlayAlbum(album.id)"
                    :disabled="playingAlbumId === album.id"
                  >
                    <span v-if="playingAlbumId === album.id" class="spinner small"></span>
                    <span v-else>▶</span>
                  </button>
                  <div class="album-title">{{ album.title }}</div>
                </div>
              </td>
              <td class="col-artist">{{ album.artist }}</td>
              <td class="col-rating">
                <span v-if="album.mb_rating != null" class="rating-badge">
                  ⭐ {{ album.mb_rating.toFixed(1) }}
                </span>
                <span v-else class="rating-na">—</span>
              </td>
              <td class="col-genre">
                <div class="genre-tags" v-if="album.genres && album.genres.length > 0">
                  <span v-for="genre in album.genres.slice(0, 3)" :key="genre" class="genre-tag">{{ genre }}</span>
                  <span v-if="album.genres.length > 3" class="genre-more">+{{ album.genres.length - 3 }}</span>
                </div>
                <span v-else class="rating-na">—</span>
              </td>
              <td class="col-date">{{ album.release_date || '—' }}</td>
            </tr>
            <!-- 详情展开行 -->
            <tr class="detail-row">
              <td :colspan="6" style="padding: 0; border: none;">
                <div class="detail-collapse" :class="{ 'detail-open': expandedAlbumId === album.id }">
                  <div class="detail-content">
                    <!-- 左侧：封面图（仅展开时渲染，避免未展开时触发无效图片请求） -->
                    <div class="detail-cover" v-if="expandedAlbumId === album.id">
                      <img
                        v-if="album.cover_url && !coverErrorSet.has(album.id)"
                        :src="album.cover_url"
                        :alt="album.title"
                        class="cover-img"
                        @error="onCoverError(album.id)"
                      />
                      <div
                        v-else
                        class="cover-placeholder"
                      >
                        💿
                      </div>
                    </div>
                    <div class="detail-cover" v-else></div>
                    <!-- 右侧：详情信息 -->
                    <div class="detail-info">
                      <!-- 风格标签完整展示 -->
                      <div class="detail-section">
                        <div class="detail-label">风格</div>
                        <div class="genre-tags" v-if="album.genres && album.genres.length > 0">
                          <span v-for="genre in album.genres" :key="genre" class="genre-tag">{{ genre }}</span>
                        </div>
                        <span v-else class="rating-na">—</span>
                      </div>
                      <!-- 元数据信息 -->
                      <div class="detail-section detail-meta">
                        <div class="meta-item">
                          <span class="meta-label">评分人数</span>
                          <span class="meta-value">{{ album.mb_rating_count != null ? album.mb_rating_count : '—' }}</span>
                        </div>
                        <div class="meta-item">
                          <span class="meta-label">曲目数</span>
                          <span class="meta-value">{{ album.track_count != null ? album.track_count : '—' }}</span>
                        </div>
                      </div>
                      <!-- 外部链接 & 操作 -->
                      <div class="detail-section detail-links">
                        <a
                          v-if="album.musicbrainz_id"
                          class="detail-link"
                          href="#"
                          @click.prevent="openExternal('https://musicbrainz.org/release-group/' + album.musicbrainz_id, $event)"
                        >
                          🔗 MusicBrainz
                        </a>
                        <a
                          v-if="album.netease_original_id"
                          class="detail-link"
                          href="#"
                          @click.prevent="openExternal('https://music.163.com/#/album?id=' + album.netease_original_id, $event)"
                        >
                          🎵 网易云音乐
                        </a>
                        <button
                          class="btn btn-resync"
                          :disabled="resyncingAlbumId === album.id"
                          @click.stop="handleResync(album.id)"
                        >
                          <span v-if="resyncingAlbumId === album.id" class="spinner small"></span>
                          <span v-else>🔄</span>
                          {{ resyncingAlbumId === album.id ? '同步中...' : '重新同步' }}
                        </button>
                      </div>
                    </div>
                    <!-- 曲目列表 -->
                    <div class="detail-tracklist">
                      <div class="tracklist-header">
                        <span class="tracklist-title">曲目列表</span>
                      </div>
                      <div v-if="trackLoading && !trackCache.has(album.id)" class="tracklist-empty">
                        加载中...
                      </div>
                      <div v-else-if="!trackCache.has(album.id) || trackCache.get(album.id)!.length === 0" class="tracklist-empty">
                        暂无曲目信息
                      </div>
                      <div v-else class="tracklist-body">
                        <template v-if="isMultiDisc(trackCache.get(album.id)!)">
                          <template v-for="[discNum, discTracks] in groupByDisc(trackCache.get(album.id)!)" :key="discNum">
                            <div class="disc-label">Disc {{ discNum }}</div>
                            <div v-for="(track, tIdx) in discTracks" :key="track.id" class="track-row">
                              <button
                                class="btn-play btn-play-track"
                                title="播放此曲"
                                @click.stop="handlePlayTrack(album.id, track)"
                                :disabled="playingTrackId === track.id"
                              >
                                <span v-if="playingTrackId === track.id" class="spinner small"></span>
                                <span v-else>▶</span>
                              </button>
                              <span class="track-num">{{ track.track_number }}</span>
                              <span class="track-title">{{ track.title }}</span>
                              <span class="track-artist">{{ track.artist || '—' }}</span>
                              <span class="track-duration">{{ formatDuration(track.duration_ms) }}</span>
                            </div>
                          </template>
                        </template>
                        <template v-else>
                          <div v-for="(track, tIdx) in trackCache.get(album.id)!" :key="track.id" class="track-row">
                            <button
                              class="btn-play btn-play-track"
                              title="播放此曲"
                              @click.stop="handlePlayTrack(album.id, track)"
                              :disabled="playingTrackId === track.id"
                            >
                              <span v-if="playingTrackId === track.id" class="spinner small"></span>
                              <span v-else>▶</span>
                            </button>
                            <span class="track-num">{{ track.track_number }}</span>
                            <span class="track-title">{{ track.title }}</span>
                            <span class="track-artist">{{ track.artist || '—' }}</span>
                            <span class="track-duration">{{ formatDuration(track.duration_ms) }}</span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </main>

    <!-- 空状态 -->
    <main class="empty-state" v-else-if="!loading">
      <div class="empty-icon">📀</div>
      <h2>还没有专辑数据</h2>
      <p>点击右上角的"同步"按钮，从网易云音乐导入你的收藏专辑</p>
      <button class="btn btn-primary btn-lg" :disabled="syncing" @click="handleSync">
        🔄 立即同步
      </button>
    </main>

    <!-- 加载状态 -->
    <main class="loading-state" v-else>
      <div class="spinner large"></div>
      <p>正在加载...</p>
    </main>

    <!-- 底部分页 -->
    <footer class="pagination" v-if="totalPages > 1">
      <button class="btn btn-sm" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
        ‹ 上一页
      </button>
      <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页（共 {{ totalAlbums }} 张专辑）</span>
      <button class="btn btn-sm" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">
        下一页 ›
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

// ==================== 状态 ====================

interface Album {
  id: number
  title: string
  artist: string
  mb_rating: number | null
  mb_rating_count: number | null
  release_date: string | null
  genres?: string[]
  cover_url?: string | null
  netease_album_id?: string | null
  netease_original_id?: number | null
  musicbrainz_id?: string | null
  track_count?: number | null
  synced_at?: string | null
  enriched_at?: string | null
}

const albums = ref<Album[]>([])
const loading = ref(true)
const syncing = ref(false)

// 展开详情
const expandedAlbumId = ref<number | null>(null)

interface Track {
  id: number
  album_id: number
  netease_song_id: string | null
  netease_original_id: number | null
  title: string
  artist: string | null
  track_number: number
  disc_number: number
  duration_ms: number | null
  created_at: string
}

const trackCache = ref<Map<number, Track[]>>(new Map())
const trackLoading = ref(false)

function toggleExpand(albumId: number) {
  expandedAlbumId.value = expandedAlbumId.value === albumId ? null : albumId
}

// 加载曲目数据
async function loadTracks(albumId: number) {
  if (trackCache.value.has(albumId)) return
  trackLoading.value = true
  try {
    const result = await window.api.trackListByAlbum(albumId)
    if (result.success && result.data) {
      trackCache.value.set(albumId, result.data)
    }
  } catch (error) {
    console.error('加载曲目失败:', error)
  } finally {
    trackLoading.value = false
  }
}

// 已尝试过远程获取封面的专辑（防止无限重试）
const coverFetchedSet = new Set<number>()
// 封面加载请求去重：避免同一专辑并发多次请求
const coverLoadingSet = new Set<number>()

// 从 ncm-cli 获取封面并替换旧的无效 URL
async function fetchCoverFromRemote(albumId: number) {
  const album = albums.value.find((a) => a.id === albumId)
  if (!album) return

  // 已经尝试过获取的不再重试，防止无限循环
  if (coverFetchedSet.has(albumId)) return

  // 防止并发重复请求
  if (coverLoadingSet.has(albumId)) return
  coverLoadingSet.add(albumId)

  try {
    coverFetchedSet.add(albumId)
    // force=true 告知后端忽略数据库已有值，从 ncm-cli 重新获取
    const result = await window.api.albumFetchCover(albumId, true)
    if (result.success && result.data?.cover_url) {
      // 清除错误标记，让 img 重新渲染
      const newSet = new Set(coverErrorSet.value)
      newSet.delete(albumId)
      coverErrorSet.value = newSet
      // 用新 URL 替换（后端已持久化到数据库）
      album.cover_url = result.data.cover_url
    }
  } catch (error) {
    console.error('获取封面失败:', error)
  } finally {
    coverLoadingSet.delete(albumId)
  }
}

// 展开时自动加载曲目；若无封面则尝试获取
watch(expandedAlbumId, (newId) => {
  if (newId != null) {
    loadTracks(newId)
    // 仅当 cover_url 为空时主动获取
    const album = albums.value.find((a) => a.id === newId)
    if (album && !album.cover_url) {
      fetchCoverFromRemote(newId)
    }
  }
})

// 格式化时长 (ms -> m:ss)
function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// 判断是否多碟专辑
function isMultiDisc(tracks: Track[]): boolean {
  if (tracks.length === 0) return false
  return new Set(tracks.map((t) => t.disc_number)).size > 1
}

// 按碟片分组
function groupByDisc(tracks: Track[]): Map<number, Track[]> {
  const groups = new Map<number, Track[]>()
  for (const track of tracks) {
    const disc = track.disc_number
    if (!groups.has(disc)) groups.set(disc, [])
    groups.get(disc)!.push(track)
  }
  return groups
}

function openExternal(url: string, event: Event) {
  event.stopPropagation()
  window.api.openExternal(url)
}

// 重新同步单张专辑
const resyncingAlbumId = ref<number | null>(null)

async function handleResync(albumId: number) {
  if (resyncingAlbumId.value !== null) return
  resyncingAlbumId.value = albumId

  try {
    const result = await window.api.albumResync(albumId)
    if (result.success && result.data) {
      const album = albums.value.find((a) => a.id === albumId)
      if (album) {
        // 更新封面
        if (result.data.cover_url) {
          // 清除封面错误状态和远程获取标记
          const newErrorSet = new Set(coverErrorSet.value)
          newErrorSet.delete(albumId)
          coverErrorSet.value = newErrorSet
          coverFetchedSet.delete(albumId)
          album.cover_url = result.data.cover_url
        }
      }
      // 清除曲目缓存以便重新加载
      trackCache.value.delete(albumId)
      // 重新加载曲目和专辑数据
      await loadTracks(albumId)
      await fetchAlbums()
    }
  } catch (error) {
    console.error('重新同步失败:', error)
  } finally {
    resyncingAlbumId.value = null
  }
}

// 播放状态
const playingAlbumId = ref<number | null>(null)
const playingTrackId = ref<number | null>(null)

async function handlePlayAlbum(albumId: number) {
  if (playingAlbumId.value !== null) return
  playingAlbumId.value = albumId

  try {
    const result = await window.api.playerPlayAlbum(albumId)
    if (!result.success) {
      console.error('播放专辑失败:', result.error)
    }
  } catch (error) {
    console.error('播放专辑失败:', error)
  } finally {
    playingAlbumId.value = null
  }
}

interface TrackInfo {
  id: number
  netease_song_id: string | null
  netease_original_id: number | null
}

async function handlePlayTrack(_albumId: number, track: TrackInfo) {
  if (playingTrackId.value !== null) return
  if (!track.netease_song_id || !track.netease_original_id) {
    console.error('该曲目缺少歌曲 ID，无法播放')
    return
  }
  playingTrackId.value = track.id

  try {
    const result = await window.api.playerPlaySong(
      track.netease_song_id,
      track.netease_original_id
    )
    if (!result.success) {
      console.error('播放曲目失败:', result.error)
    }
  } catch (error) {
    console.error('播放曲目失败:', error)
  } finally {
    playingTrackId.value = null
  }
}

const coverErrorSet = ref<Set<number>>(new Set())

function onCoverError(albumId: number) {
  coverErrorSet.value = new Set(coverErrorSet.value).add(albumId)
  // 图片加载失败，尝试从 ncm-cli 获取新的封面 URL
  fetchCoverFromRemote(albumId)
}

// 搜索 & 筛选
const searchQuery = ref('')
const selectedArtist = ref('')
const selectedGenre = ref('')
const artists = ref<string[]>([])
const genres = ref<string[]>([])

// 排序
const sortBy = ref<'mb_rating' | 'release_date' | undefined>(undefined)
const sortOrder = ref<'asc' | 'desc'>('desc')

// 分页
const currentPage = ref(1)
const totalPages = ref(1)
const totalAlbums = ref(0)
const pageSize = 20

// 消息提示
const message = ref('')
const messageType = ref<'success' | 'error' | 'info'>('info')

// 补全进度
const enrichProgress = ref<{ current: number; total: number; albumTitle: string } | null>(null)

// ==================== 数据获取 ====================

async function fetchAlbums() {
  try {
    const result = await window.api.albumList({
      search: searchQuery.value || undefined,
      artist: selectedArtist.value || undefined,
      genre: selectedGenre.value || undefined,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      page: currentPage.value,
      pageSize
    })

    if (result.success && result.data) {
      albums.value = result.data.albums
      totalPages.value = result.data.totalPages
      totalAlbums.value = result.data.total
      currentPage.value = result.data.page
    }
  } catch (error) {
    showMessage('加载专辑列表失败', 'error')
  } finally {
    loading.value = false
  }
}

async function fetchFilters() {
  try {
    const result = await window.api.albumFilters()
    if (result.success && result.data) {
      artists.value = result.data.artists
      genres.value = result.data.genres
    }
  } catch (error) {
    console.error('获取筛选选项失败:', error)
  }
}

// ==================== 搜索 ====================

let searchTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    fetchAlbums()
  }, 300)
}

function clearSearch() {
  searchQuery.value = ''
  currentPage.value = 1
  fetchAlbums()
}

// ==================== 筛选 ====================

function applyFilters() {
  currentPage.value = 1
  fetchAlbums()
}

// ==================== 排序 ====================

function toggleSort(field: 'mb_rating' | 'release_date') {
  if (sortBy.value === field) {
    // 点击同一列：切换排序方向
    sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  } else {
    // 点击不同列：设置新排序，默认降序
    sortBy.value = field
    sortOrder.value = 'desc'
  }
  currentPage.value = 1
  fetchAlbums()
}

// ==================== 分页 ====================

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  fetchAlbums()
}

// ==================== 同步 ====================

async function handleSync() {
  syncing.value = true
  showMessage('正在同步专辑数据...', 'info')

  try {
    const result = await window.api.syncStart()
    if (result.success && result.data) {
      const { added, skipped, total } = result.data
      if (added > 0) {
        showMessage(`同步完成！新增 ${added} 张专辑，跳过 ${skipped} 张已存在`, 'success')
      } else {
        showMessage(`同步完成，没有新增专辑（${total} 张均已存在）`, 'info')
      }
      // 刷新数据
      await fetchFilters()
      await fetchAlbums()
    } else {
      showMessage(`同步失败：${result.error}`, 'error')
    }
  } catch (error) {
    showMessage('同步失败：网络错误', 'error')
  } finally {
    syncing.value = false
  }
}

// ==================== 消息提示 ====================

function showMessage(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  message.value = msg
  messageType.value = type

  if (type !== 'error') {
    setTimeout(() => {
      if (message.value === msg) message.value = ''
    }, 5000)
  }
}

// ==================== 补全进度 ====================

let removeProgressListener: (() => void) | null = null

function setupProgressListener() {
  removeProgressListener = window.api.onEnrichProgress((progress) => {
    enrichProgress.value = {
      current: progress.current,
      total: progress.total,
      albumTitle: progress.albumTitle
    }

    // 补全完成
    if (progress.current >= progress.total) {
      setTimeout(() => {
        enrichProgress.value = null
        fetchAlbums()
        fetchFilters()
        showMessage('数据补全完成！', 'success')
      }, 1000)
    }
  })
}

// ==================== 重新补全所有 ====================

let removeMenuReEnrichListener: (() => void) | null = null

async function handleReEnrichAll() {
  if (enrichProgress.value) {
    showMessage('补全正在进行中，请等待完成', 'info')
    return
  }

  showMessage('正在重新补全所有专辑的评分和风格信息...', 'info')

  try {
    const result = await window.api.enrichReEnrichAll()
    if (!result.success) {
      showMessage(`重新补全失败：${result.error}`, 'error')
    }
    // 进度和完成提示由 onEnrichProgress 回调处理
  } catch (error) {
    showMessage('重新补全失败：未知错误', 'error')
  }
}

// ==================== 生命周期 ====================

onMounted(async () => {
  setupProgressListener()

  // 监听菜单栏"重新补全所有专辑"事件
  removeMenuReEnrichListener = window.api.onMenuReEnrichAll(() => {
    handleReEnrichAll()
  })

  await fetchFilters()
  await fetchAlbums()
})

onUnmounted(() => {
  if (removeProgressListener) {
    removeProgressListener()
  }
  if (removeMenuReEnrichListener) {
    removeMenuReEnrichListener()
  }
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})
</script>

<style>
/* ==================== Reset & Base ==================== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --primary: #5b6abf;
  --primary-hover: #4a59a8;
  --bg: #f8f9fb;
  --surface: #ffffff;
  --border: #e2e6ea;
  --text: #2c3e50;
  --text-secondary: #6c757d;
  --success: #28a745;
  --error: #dc3545;
  --info: #17a2b8;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC',
    'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
  background-color: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ==================== Toolbar ==================== */
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow);
  z-index: 10;
  -webkit-app-region: drag;
}

.toolbar-left {
  flex-shrink: 0;
}

.logo {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--primary);
  user-select: none;
}

.toolbar-center {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.toolbar-right {
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

/* ==================== Search ==================== */
.search-box {
  position: relative;
  flex: 1;
  max-width: 360px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 7px 30px 7px 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  background: var(--bg);
}

.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(91, 106, 191, 0.1);
}

.search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 50%;
}

.search-clear:hover {
  background: var(--border);
}

/* ==================== Filter Select ==================== */
.filter-select {
  padding: 7px 28px 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  outline: none;
  background: var(--bg);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236c757d' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  min-width: 120px;
}

.filter-select:focus {
  border-color: var(--primary);
}

/* ==================== Buttons ==================== */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  cursor: pointer;
  background: var(--surface);
  color: var(--text);
  transition: all 0.15s;
  user-select: none;
}

.btn:hover:not(:disabled) {
  background: var(--bg);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

.btn-lg {
  padding: 10px 24px;
  font-size: 15px;
}

/* ==================== Spinner ==================== */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.6s linear infinite;
}

.spinner.large {
  width: 32px;
  height: 32px;
  border-color: rgba(91, 106, 191, 0.2);
  border-top-color: var(--primary);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ==================== Enrich Progress Bar ==================== */
.enrich-bar {
  background: #eef2ff;
  border-bottom: 1px solid #c7d2fe;
  padding: 8px 20px;
}

.enrich-bar-inner {
  display: flex;
  align-items: center;
  gap: 12px;
}

.enrich-text {
  font-size: 12px;
  color: var(--primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.enrich-progress-track {
  flex: 1;
  height: 4px;
  background: #c7d2fe;
  border-radius: 2px;
  overflow: hidden;
}

.enrich-progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  transition: width 0.3s;
}

/* ==================== Message Bar ==================== */
.message-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  font-size: 13px;
  animation: slideDown 0.2s ease;
}

.message-bar.success {
  background: #d4edda;
  color: #155724;
  border-bottom: 1px solid #c3e6cb;
}

.message-bar.error {
  background: #f8d7da;
  color: #721c24;
  border-bottom: 1px solid #f5c6cb;
}

.message-bar.info {
  background: #d1ecf1;
  color: #0c5460;
  border-bottom: 1px solid #bee5eb;
}

.message-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: inherit;
  opacity: 0.6;
  padding: 0 4px;
}

.message-close:hover {
  opacity: 1;
}

@keyframes slideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* ==================== Table ==================== */
.table-container {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.album-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.album-table thead {
  position: sticky;
  top: 0;
  z-index: 5;
}

.album-table th {
  background: #f0f2f5;
  padding: 10px 14px;
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
  user-select: none;
}

.album-table th.sortable {
  cursor: pointer;
  transition: color 0.15s;
}

.album-table th.sortable:hover {
  color: var(--primary);
}

.sort-arrow {
  font-size: 10px;
  margin-left: 2px;
  color: var(--primary);
}

.album-table td {
  padding: 10px 14px;
  border-bottom: 1px solid #f0f2f5;
  font-size: 13px;
  vertical-align: middle;
}

.album-table tbody tr.album-row {
  cursor: pointer;
  transition: background 0.1s;
}

.album-table tbody tr.album-row:hover {
  background: #f8f9ff;
}

.album-table tbody tr.album-row.row-expanded {
  background: #eef2ff;
}

/* ==================== Detail Row ==================== */
.detail-row {
  background: none !important;
}

.detail-row:hover {
  background: none !important;
}

.detail-collapse {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.35s ease;
}

.detail-collapse.detail-open {
  max-height: 800px;
}

.detail-content {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  padding: 16px 20px;
  background: #fafbfe;
  border-bottom: 1px solid var(--border);
}

.detail-cover {
  flex-shrink: 0;
  width: 140px;
  height: 140px;
}

.cover-img {
  width: 140px;
  height: 140px;
  object-fit: cover;
  border-radius: var(--radius);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.cover-placeholder {
  width: 140px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e8ecf4;
  border-radius: var(--radius);
  font-size: 3rem;
  color: #a0aec0;
}

.detail-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.detail-section {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px;
}

.detail-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-right: 4px;
  line-height: 22px;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meta-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.meta-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.detail-links {
  display: flex;
  gap: 12px;
}

.detail-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 12px;
  color: var(--primary);
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.detail-link:hover {
  background: #eef2ff;
  border-color: var(--primary);
}

.btn-resync {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.btn-resync:hover:not(:disabled) {
  background: #fff7ed;
  border-color: #f59e0b;
  color: #d97706;
}

.btn-resync:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-resync .spinner.small {
  width: 12px;
  height: 12px;
  border-width: 2px;
}

/* ==================== Play Button ==================== */
.album-title-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s, opacity 0.15s;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
}

.btn-play:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-play-album {
  width: 28px;
  height: 28px;
  font-size: 11px;
  background: var(--primary);
  color: white;
}

.btn-play-album:hover:not(:disabled) {
  background: #4338ca;
  transform: scale(1.1);
}

.btn-play-track {
  width: 22px;
  height: 22px;
  font-size: 9px;
  background: transparent;
  color: var(--text-secondary);
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.track-row:hover .btn-play-track {
  opacity: 1;
}

.btn-play-track:hover:not(:disabled) {
  background: var(--primary);
  color: white;
}

.btn-play-track:disabled {
  opacity: 1;
}

.btn-play .spinner.small {
  width: 10px;
  height: 10px;
  border-width: 2px;
}

/* ==================== Tracklist ==================== */
.detail-tracklist {
  width: 100%;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.tracklist-header {
  margin-bottom: 8px;
}

.tracklist-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.tracklist-empty {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 12px 0;
}

.tracklist-body {
  max-height: 320px;
  overflow-y: auto;
}

.tracklist-body::-webkit-scrollbar {
  width: 4px;
}

.tracklist-body::-webkit-scrollbar-track {
  background: transparent;
}

.tracklist-body::-webkit-scrollbar-thumb {
  background: #d0d5dd;
  border-radius: 2px;
}

.disc-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  padding: 6px 0 4px;
  border-bottom: 1px solid #eef2ff;
  margin-bottom: 2px;
}

.track-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  border-bottom: 1px solid #f5f6f8;
  transition: background 0.1s;
}

.track-row:last-child {
  border-bottom: none;
}

.track-row:hover {
  background: #f0f2f8;
}

.track-num {
  width: 32px;
  text-align: right;
  color: var(--text-secondary);
  font-size: 12px;
  flex-shrink: 0;
}

.track-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--text);
}

.track-artist {
  flex: 0 1 auto;
  max-width: 280px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: right;
}

.track-duration {
  flex: 0 0 48px;
  text-align: right;
  color: var(--text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* Column widths */
.col-index { width: 48px; text-align: center; color: var(--text-secondary); }
.col-title { width: 28%; }
.col-artist { width: 18%; }
.col-rating { width: 80px; text-align: center; }
.col-genre { width: 26%; }
.col-date { width: 110px; }

.album-title {
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ==================== Rating ==================== */
.rating-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  color: #d97706;
}

.rating-na {
  color: #ccc;
}

/* ==================== Genre Tags ==================== */
.genre-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.genre-tag {
  display: inline-block;
  padding: 2px 8px;
  background: #eef2ff;
  color: var(--primary);
  border-radius: 12px;
  font-size: 11px;
  white-space: nowrap;
}

.genre-more {
  display: inline-block;
  padding: 2px 6px;
  color: var(--text-secondary);
  font-size: 11px;
}

/* ==================== Empty State ==================== */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 4rem;
  opacity: 0.3;
}

.empty-state h2 {
  font-size: 1.3rem;
  color: var(--text);
}

.empty-state p {
  font-size: 14px;
  margin-bottom: 8px;
}

/* ==================== Loading State ==================== */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
}

/* ==================== Pagination ==================== */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 10px 20px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.page-info {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ==================== Scrollbar ==================== */
.table-container::-webkit-scrollbar {
  width: 6px;
}

.table-container::-webkit-scrollbar-track {
  background: transparent;
}

.table-container::-webkit-scrollbar-thumb {
  background: #d0d5dd;
  border-radius: 3px;
}

.table-container::-webkit-scrollbar-thumb:hover {
  background: #b0b5bd;
}
</style>