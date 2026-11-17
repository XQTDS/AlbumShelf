<template>
  <div class="artist-window">
    <div class="ab-toolbar">
      <input
        v-model="searchQuery"
        class="ab-search"
        type="search"
        placeholder="搜索艺人名或别名…"
        aria-label="搜索艺人"
      />
      <select v-model="sortKey" class="ab-sort" aria-label="排序方式">
        <option value="album_count">专辑数 ↓</option>
        <option value="name">名字 A-Z</option>
        <option value="rating">平均评分 ↓</option>
      </select>
      <span class="ab-count">
        共 {{ artists.length }} 位<template v-if="searchQuery.trim()"> · 命中 {{ filteredArtists.length }} 位</template>
      </span>
      <button class="ab-link-btn" :disabled="loading" @click="reloadAll">
        {{ loading ? '刷新中…' : '刷新' }}
      </button>
    </div>

    <div class="ab-body">
      <aside class="ab-sidebar">
        <div v-if="loading && artists.length === 0" class="ab-empty">加载中...</div>
        <div v-else-if="loadError" class="ab-empty ab-error">
          {{ loadError }}
          <button class="ab-retry" @click="reloadAll">重试</button>
        </div>
        <div v-else-if="artists.length === 0" class="ab-empty">
          还没有任何专辑。<br />先在主界面同步专辑列表。
        </div>
        <div v-else-if="filteredArtists.length === 0" class="ab-empty">
          没有匹配的艺人。
        </div>
        <div v-else class="ab-list">
          <div
            v-for="artist in filteredArtists"
            :key="artist.key"
            class="ab-artist-row"
            :class="{ selected: artist.key === selectedKey }"
            role="button"
            tabindex="0"
            @click="handleArtistRowClick(artist.key)"
            @keydown.enter.prevent="selectArtist(artist.key)"
            @keydown.space.prevent="selectArtist(artist.key)"
          >
            <span class="ab-artist-name" :title="artist.name">{{ artist.name }}</span>
            <span class="ab-artist-meta">
              <span
                v-if="artist.region_label"
                class="ab-region-chip"
                :title="artist.region_area || artist.region_label"
              >{{ artist.region_label }}</span>
              <span class="ab-artist-count">{{ artist.album_count }} 张</span>
              <span class="ab-artist-rating">
                <template v-if="artist.average_rating != null">
                  ★ {{ formatRating(artist.average_rating) }}<span class="ab-rated-count">({{ artist.rated_album_count }}/{{ artist.album_count }})</span>
                </template>
                <template v-else>—</template>
              </span>
              <span v-if="artist.is_synthetic" class="ab-synthetic-chip">群星/合辑</span>
            </span>
          </div>
        </div>
      </aside>

      <section class="ab-detail">
        <div v-if="!selectedArtist" class="ab-empty ab-detail-empty">
          从左侧选择一位艺人。
        </div>

        <template v-else>
          <header class="ab-detail-header">
            <div class="ab-detail-title-row">
              <h2 class="ab-detail-name">{{ selectedArtist.name }}</h2>
              <span
                v-if="selectedArtist.region_label"
                class="ab-region-chip large"
                :title="selectedArtist.region_area || selectedArtist.region_label"
              >{{ selectedArtist.region_label }}</span>
              <span v-else class="ab-region-empty" title="没有地区数据">地区 —</span>
              <button
                v-if="canEditRegion"
                class="ab-edit-region"
                title="修改艺人地区"
                aria-label="修改艺人地区"
                @click="openRegionEditor"
              >✎</button>
              <span
                v-else
                class="ab-edit-region disabled"
                title="该艺人未关联网易云 ID，暂不支持修改地区"
              >✎</span>
              <span
                v-if="selectedArtist.region_source === 'manual'"
                class="ab-manual-chip"
                title="手动设置，自动补全不会覆盖"
              >手动</span>
            </div>

            <div class="ab-detail-stats">
              <span>{{ selectedArtist.album_count }} 张专辑</span>
              <span v-if="selectedArtist.primary_album_count !== selectedArtist.album_count">
                （主 {{ selectedArtist.primary_album_count }} · 参与 {{ selectedArtist.album_count - selectedArtist.primary_album_count }}）
              </span>
              <span class="ab-dot">·</span>
              <span v-if="selectedArtist.average_rating != null">
                平均评分 ★ {{ formatRating(selectedArtist.average_rating) }}
                <span class="ab-rated-count">（{{ selectedArtist.rated_album_count }} / {{ selectedArtist.album_count }} 张已评）</span>
              </span>
              <span v-else>
                平均评分 — <span class="ab-rated-count">（0 / {{ selectedArtist.album_count }} 张已评）</span>
              </span>
              <span
                v-if="selectedArtist.alias_names.length"
                class="ab-alias-line"
                :title="selectedArtist.alias_names.join(' / ')"
              >· 别名：{{ selectedArtist.alias_names.join(' / ') }}</span>
            </div>
          </header>

          <div class="ab-album-area">
            <div v-if="albumsLoading" class="ab-empty">加载专辑…</div>
            <div v-else-if="albumsError" class="ab-empty ab-error">
              {{ albumsError }}
              <button class="ab-retry" @click="loadAlbums(selectedArtist.key)">重试</button>
            </div>
            <div v-else-if="albums.length === 0" class="ab-empty">该艺人暂无专辑。</div>
            <div v-else class="ab-album-list">
              <div
                v-for="album in albums"
                :key="album.id"
                class="ab-album-row"
                role="button"
                tabindex="0"
                title="在主界面打开专辑详情"
                @click="handleAlbumRowClick(album)"
                @keydown.enter.prevent="openAlbum(album)"
                @keydown.space.prevent="openAlbum(album)"
              >
                <span class="ab-cover-wrap">
                  <img
                    v-if="coverSrc(album) && !coverFailed.has(album.id)"
                    class="ab-cover"
                    :src="coverSrc(album) || ''"
                    alt=""
                    loading="lazy"
                    @error="onCoverError(album)"
                  />
                  <span v-else class="ab-cover ab-cover-placeholder">💿</span>
                </span>
                <span class="ab-album-main">
                  <span class="ab-album-title">{{ album.title }}</span>
                  <span class="ab-album-meta">
                    <span v-if="album.release_date" class="ab-album-date">{{ album.release_date }}</span>
                    <span v-if="!album.is_primary" class="ab-collab-chip">合作</span>
                    <span class="ab-album-artist">{{ album.artist_text }}</span>
                  </span>
                </span>
                <span class="ab-album-rating">
                  <template v-if="album.user_rating != null">
                    <span class="ab-stars" aria-hidden="true">
                      <span
                        v-for="star in 5"
                        :key="star"
                        :class="starClass(album.user_rating, star)"
                      >★</span>
                    </span>
                    <span class="ab-rating-value">{{ formatRating(album.user_rating) }}</span>
                  </template>
                  <span v-else class="ab-rating-empty">—</span>
                </span>
              </div>
            </div>
          </div>

          <div v-if="jumpError" class="ab-error-bar">{{ jumpError }}</div>
        </template>
      </section>
    </div>

    <!-- 地区编辑弹窗 -->
    <div v-if="regionEditorOpen" class="ab-modal-backdrop" @click.self="closeRegionEditor">
      <div class="ab-modal" role="dialog" aria-modal="true" aria-label="修改艺人地区">
        <div class="ab-modal-head">
          <h3>修改艺人地区</h3>
          <button class="ab-modal-close" aria-label="关闭" @click="closeRegionEditor">×</button>
        </div>
        <div class="ab-modal-sub">{{ selectedArtist?.name }}</div>
        <input
          ref="regionSearchRef"
          v-model="regionQuery"
          class="ab-region-search"
          type="search"
          placeholder="搜索国家/地区（中文或代码）…"
          aria-label="搜索地区"
        />
        <div class="ab-region-list">
          <button
            v-for="option in filteredRegionOptions"
            :key="option.key"
            class="ab-region-option"
            :class="{ selected: regionDraft === option.key }"
            @click="selectRegionDraft(option.key)"
          >
            <span>{{ option.label }}</span>
            <span class="ab-region-code">{{ option.key }}</span>
          </button>
          <div v-if="filteredRegionOptions.length === 0" class="ab-empty">没有匹配的地区。</div>
        </div>
        <div class="ab-modal-actions">
          <button class="ab-btn-ghost" @click="clearRegionDraft">清除地区</button>
          <span class="ab-modal-spacer"></span>
          <button class="ab-btn-ghost" @click="closeRegionEditor">取消</button>
          <button
            class="ab-btn-primary"
            :disabled="regionSaving || !regionDirty"
            @click="saveRegion"
          >
            {{ regionSaving ? '保存中…' : '保存' }}
          </button>
        </div>
        <div v-if="regionError" class="ab-error">{{ regionError }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

// 本地接口（renderer tsconfig 不引入 preload/index.d.ts 全局类型，与关注窗口同因）
interface ArtistSummary {
  key: string
  netease_artist_id: number | null
  netease_encrypted_id: string | null
  name: string
  alias_names: string[]
  region: string | null
  region_label: string | null
  region_area: string | null
  region_source: 'manual' | null
  album_count: number
  primary_album_count: number
  rated_album_count: number
  average_rating: number | null
  is_synthetic: boolean
}

interface ArtistAlbum {
  id: number
  title: string
  cover_url: string | null
  user_rating: number | null
  release_date: string | null
  is_primary: boolean
  artist_text: string
}

interface RegionOption {
  key: string
  label: string
}

const artists = ref<ArtistSummary[]>([])
const albums = ref<ArtistAlbum[]>([])
const loading = ref(true)
const loadError = ref('')
const albumsLoading = ref(false)
const albumsError = ref('')
const jumpError = ref('')

const searchQuery = ref('')
const sortKey = ref<'album_count' | 'name' | 'rating'>('album_count')
const selectedKey = ref<string | null>(null)

const regionOptions = ref<RegionOption[]>([])
const regionEditorOpen = ref(false)
const regionDraft = ref<string | null>(null)
const regionQuery = ref('')
const regionSaving = ref(false)
const regionError = ref('')
const regionSearchRef = ref<HTMLInputElement | null>(null)

/** cover:// 失败 → 回退远程 URL；远程也失败 → 占位符 */
const coverFallback = ref<Set<number>>(new Set())
const coverFailed = ref<Set<number>>(new Set())

let albumRequestSeq = 0
let focusTimer: ReturnType<typeof setTimeout> | null = null

const selectedArtist = computed(
  () => artists.value.find((artist) => artist.key === selectedKey.value) ?? null
)

const canEditRegion = computed(() => {
  const artist = selectedArtist.value
  return !!(
    artist &&
    artist.netease_artist_id != null &&
    artist.netease_artist_id > 0 &&
    artist.key.startsWith('netease:')
  )
})

const filteredArtists = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const list = query
    ? artists.value.filter(
        (artist) =>
          artist.name.toLowerCase().includes(query) ||
          artist.alias_names.some((name) => name.toLowerCase().includes(query))
      )
    : artists.value.slice()

  return list.sort((a, b) => {
    // 合成艺人/合辑沉底，其余按当前排序键
    if (a.is_synthetic !== b.is_synthetic) return a.is_synthetic ? 1 : -1

    if (sortKey.value === 'name') {
      return a.name.localeCompare(b.name, 'zh-CN')
    }

    if (sortKey.value === 'rating') {
      if (a.average_rating == null && b.average_rating == null) {
        return a.name.localeCompare(b.name, 'zh-CN')
      }
      if (a.average_rating == null) return 1
      if (b.average_rating == null) return -1
      if (b.average_rating !== a.average_rating) {
        return b.average_rating - a.average_rating
      }
      return a.name.localeCompare(b.name, 'zh-CN')
    }

    return (
      b.album_count - a.album_count ||
      a.name.localeCompare(b.name, 'zh-CN')
    )
  })
})

const filteredRegionOptions = computed(() => {
  const query = regionQuery.value.trim().toLowerCase()
  if (!query) return regionOptions.value
  return regionOptions.value.filter(
    (option) =>
      option.label.toLowerCase().includes(query) || option.key.toLowerCase().includes(query)
  )
})

const regionDirty = computed(
  () => regionDraft.value !== (selectedArtist.value?.region ?? null)
)

// 切换艺人时关闭地区弹窗，避免把旧艺人的草稿保存到新选中艺人
watch(selectedKey, () => {
  if (regionEditorOpen.value) closeRegionEditor()
})

async function loadArtists(preserveSelection: boolean): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const result = await window.api.artistBrowserList()
    if (!result.success || !result.data) {
      loadError.value = result.error || '艺人列表加载失败'
      return
    }

    artists.value = result.data
    loadError.value = ''

    const selectionAlive =
      selectedKey.value != null &&
      artists.value.some((artist) => artist.key === selectedKey.value)

    if (!preserveSelection || !selectionAlive) {
      const first = filteredArtists.value[0]
      if (first) {
        await selectArtist(first.key)
      } else {
        selectedKey.value = null
        albums.value = []
      }
    } else if (selectedKey.value) {
      await loadAlbums(selectedKey.value)
    }
  } catch {
    loadError.value = '艺人列表加载失败'
  } finally {
    loading.value = false
  }
}

async function loadAlbums(key: string): Promise<void> {
  const seq = ++albumRequestSeq
  albumsLoading.value = true
  albumsError.value = ''
  try {
    const result = await window.api.artistBrowserAlbums(key)
    if (seq !== albumRequestSeq) return
    if (result.success && result.data) {
      albums.value = result.data
    } else {
      albums.value = []
      albumsError.value = result.error || '专辑加载失败'
    }
  } catch {
    if (seq === albumRequestSeq) {
      albums.value = []
      albumsError.value = '专辑加载失败'
    }
  } finally {
    if (seq === albumRequestSeq) albumsLoading.value = false
  }
}

async function selectArtist(key: string): Promise<void> {
  selectedKey.value = key
  jumpError.value = ''
  await loadAlbums(key)
}

/** 鼠标拖选文字时不触发行点击，避免复制艺人名/专辑名时切换选中或打开专辑 */
function hasTextSelection(): boolean {
  const selection = window.getSelection()
  return !!selection && !selection.isCollapsed && selection.toString().trim().length > 0
}

function handleArtistRowClick(key: string): void {
  if (hasTextSelection()) return
  void selectArtist(key)
}

function handleAlbumRowClick(album: ArtistAlbum): void {
  if (hasTextSelection()) return
  void openAlbum(album)
}

async function reloadAll(): Promise<void> {
  await loadArtists(true)
}

async function loadRegionOptions(): Promise<void> {
  try {
    const result = await window.api.artistBrowserRegionOptions()
    if (result.success && result.data) {
      regionOptions.value = result.data
    }
  } catch {
    // 选择器为空时仍可清除地区；静默降级
  }
}

function coverSrc(album: ArtistAlbum): string | null {
  if (!album.cover_url) return null
  if (coverFallback.value.has(album.id)) return album.cover_url
  return `cover://album/${album.id}`
}

function onCoverError(album: ArtistAlbum): void {
  if (!coverFallback.value.has(album.id)) {
    coverFallback.value = new Set(coverFallback.value).add(album.id)
    return
  }
  if (!coverFailed.value.has(album.id)) {
    coverFailed.value = new Set(coverFailed.value).add(album.id)
  }
}

function formatRating(rating: number | null): string {
  return rating == null ? '—' : rating.toFixed(1)
}

function starClass(rating: number | null, star: number): string {
  if (rating == null) return 'empty'
  if (rating >= star) return 'full'
  if (rating >= star - 0.5) return 'half'
  return 'empty'
}

async function openAlbum(album: ArtistAlbum): Promise<void> {
  jumpError.value = ''
  try {
    const result = await window.api.artistBrowserOpenAlbum(album.id)
    if (!result.success) {
      jumpError.value = result.error || '打开专辑详情失败'
      if ((result.error || '').includes('不在库中') && selectedKey.value) {
        await loadAlbums(selectedKey.value)
      }
    }
  } catch {
    jumpError.value = '打开专辑详情失败'
  }
}

function openRegionEditor(): void {
  const artist = selectedArtist.value
  if (!artist || !canEditRegion.value) return

  regionDraft.value = artist.region
  regionQuery.value = ''
  regionError.value = ''
  regionEditorOpen.value = true
  void nextTick(() => regionSearchRef.value?.focus())
}

function selectRegionDraft(key: string): void {
  regionDraft.value = key
}

function clearRegionDraft(): void {
  regionDraft.value = null
}

function closeRegionEditor(): void {
  regionEditorOpen.value = false
  regionSaving.value = false
  regionError.value = ''
}

async function saveRegion(): Promise<void> {
  const artist = selectedArtist.value
  if (!artist || !canEditRegion.value || !regionDirty.value) {
    closeRegionEditor()
    return
  }

  regionSaving.value = true
  regionError.value = ''
  try {
    const result = await window.api.artistBrowserSetRegion({
      key: artist.key,
      name: artist.name,
      neteaseArtistId: artist.netease_artist_id as number,
      neteaseEncryptedId: artist.netease_encrypted_id,
      region: regionDraft.value
    })
    if (!result.success) {
      regionError.value = result.error || '保存失败'
      return
    }
    if (result.data) {
      const updated = result.data as ArtistSummary
      artists.value = artists.value.map((item) =>
        item.key === updated.key ? updated : item
      )
    }
    regionEditorOpen.value = false
  } catch {
    regionError.value = '保存失败'
  } finally {
    regionSaving.value = false
  }
}

function onWindowFocus(): void {
  if (focusTimer) clearTimeout(focusTimer)
  focusTimer = setTimeout(() => {
    focusTimer = null
    void loadArtists(true)
  }, 200)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (regionEditorOpen.value) {
    event.preventDefault()
    closeRegionEditor()
    return
  }
  window.api.artistBrowserCloseWindow()
}

onMounted(() => {
  void loadRegionOptions()
  void loadArtists(false)
  window.addEventListener('focus', onWindowFocus)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  if (focusTimer) clearTimeout(focusTimer)
  window.removeEventListener('focus', onWindowFocus)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style>
/* 独立窗口：自带设计令牌（与主界面/关注列表一致的浅色主题） */
:root {
  --primary: #5b6abf;
  --bg: #f8f9fb;
  --surface: #ffffff;
  --border: #e2e6ea;
  --text: #2c3e50;
  --text-secondary: #6c757d;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}
</style>

<style scoped>
.artist-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 14px;
}

/* ---- 工具栏 ---- */
.ab-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

.ab-search,
.ab-region-search {
  min-width: 180px;
  padding: 7px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  outline: none;
}

.ab-search:focus,
.ab-region-search:focus {
  border-color: var(--primary);
}

.ab-sort {
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
}

.ab-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.ab-link-btn {
  margin-left: auto;
  padding: 4px 6px;
  font: inherit;
  font-size: 12px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-decoration: underline;
}

.ab-link-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

/* ---- 主体 ---- */
.ab-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  padding-top: 10px;
}

.ab-sidebar {
  width: 262px;
  flex-shrink: 0;
  overflow-y: auto;
  padding-right: 8px;
  border-right: 1px solid var(--border);
}

.ab-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ab-artist-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px 10px;
  font: inherit;
  text-align: left;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  content-visibility: auto;
  contain-intrinsic-size: 58px;
}

.ab-artist-row:hover {
  border-color: var(--primary);
}

.ab-artist-row.selected {
  border-color: var(--primary);
  background: rgba(91, 106, 191, 0.08);
  box-shadow: inset 3px 0 0 var(--primary);
}

/* 内容区允许鼠标框选/复制；行本身可点，拖选文字时由脚本忽略行点击 */
.ab-artist-row,
.ab-album-row,
.ab-artist-name,
.ab-detail-name,
.ab-album-title,
.ab-album-artist {
  user-select: text;
  -webkit-user-select: text;
}

.ab-artist-row:focus-visible,
.ab-album-row:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.ab-artist-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ab-artist-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--text-secondary);
}

.ab-artist-count,
.ab-artist-rating {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.ab-rated-count {
  margin-left: 2px;
  opacity: 0.75;
}

.ab-region-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  font-size: 10px;
  color: var(--primary);
  background: rgba(91, 106, 191, 0.09);
  border: 1px solid rgba(91, 106, 191, 0.22);
  border-radius: 8px;
  white-space: nowrap;
}

.ab-region-chip.large {
  font-size: 11px;
  padding: 2px 8px;
}

.ab-region-empty {
  font-size: 11px;
  color: var(--text-secondary);
}

.ab-synthetic-chip,
.ab-collab-chip,
.ab-manual-chip {
  padding: 1px 6px;
  font-size: 10px;
  border-radius: 8px;
  white-space: nowrap;
}

.ab-synthetic-chip {
  color: #8a6d3b;
  background: rgba(232, 181, 58, 0.14);
}

.ab-collab-chip {
  color: var(--text-secondary);
  background: rgba(108, 117, 125, 0.12);
}

.ab-manual-chip {
  color: #2f6f4f;
  background: rgba(47, 111, 79, 0.12);
}

/* ---- 详情 ---- */
.ab-detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ab-detail-empty {
  padding-top: 80px;
}

.ab-detail-header {
  padding: 2px 2px 10px;
  border-bottom: 1px solid var(--border);
}

.ab-detail-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ab-detail-name {
  font-size: 20px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.ab-edit-region {
  padding: 2px 6px;
  font: inherit;
  font-size: 14px;
  color: var(--primary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
}

.ab-edit-region:hover {
  border-color: var(--primary);
  background: rgba(91, 106, 191, 0.06);
}

.ab-edit-region.disabled {
  color: var(--text-secondary);
  opacity: 0.4;
  cursor: default;
}

.ab-detail-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.ab-dot {
  opacity: 0.5;
}

.ab-alias-line {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- 专辑列表 ---- */
.ab-album-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 10px;
}

.ab-album-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ab-album-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  font: inherit;
  text-align: left;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  content-visibility: auto;
  contain-intrinsic-size: 56px;
}

.ab-album-row:hover {
  border-color: var(--primary);
}

.ab-cover-wrap {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
}

.ab-cover {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--bg);
}

.ab-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--text-secondary);
}

.ab-album-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ab-album-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ab-album-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
  color: var(--text-secondary);
}

.ab-album-date {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.ab-album-artist {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ab-album-rating {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.ab-stars {
  font-size: 12px;
  letter-spacing: 1px;
}

.ab-stars .full {
  color: #e8b53a;
}

.ab-stars .half {
  color: transparent;
  background: linear-gradient(90deg, #e8b53a 50%, #d0d4d9 50%);
  -webkit-background-clip: text;
  background-clip: text;
}

.ab-stars .empty {
  color: #d0d4d9;
}

.ab-rating-value {
  font-size: 12px;
  color: var(--text);
}

.ab-rating-empty {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ---- 状态 ---- */
.ab-empty {
  padding: 36px 12px;
  text-align: center;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.ab-error {
  color: #d9534f;
  font-size: 12px;
  text-align: center;
  line-height: 1.7;
}

.ab-error-bar {
  margin-top: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #d9534f;
  background: rgba(217, 83, 79, 0.07);
  border: 1px solid rgba(217, 83, 79, 0.2);
  border-radius: 5px;
}

.ab-retry {
  margin-left: 6px;
  padding: 2px 8px;
  font: inherit;
  font-size: 12px;
  color: var(--primary);
  background: transparent;
  border: 1px solid var(--primary);
  border-radius: 4px;
  cursor: pointer;
}

/* ---- 地区弹窗 ---- */
.ab-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 35, 45, 0.35);
}

.ab-modal {
  display: flex;
  flex-direction: column;
  width: min(520px, calc(100vw - 40px));
  max-height: min(620px, calc(100vh - 40px));
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}

.ab-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ab-modal-head h3 {
  font-size: 15px;
}

.ab-modal-close {
  padding: 2px 8px;
  font: inherit;
  font-size: 18px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
}

.ab-modal-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ab-region-search {
  width: 100%;
  margin-top: 10px;
}

.ab-region-list {
  flex: 1;
  min-height: 180px;
  max-height: 360px;
  overflow-y: auto;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ab-region-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px;
  font: inherit;
  font-size: 13px;
  text-align: left;
  color: var(--text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
}

.ab-region-option:hover {
  background: var(--bg);
}

.ab-region-option.selected {
  color: var(--primary);
  background: rgba(91, 106, 191, 0.08);
  border-color: var(--primary);
}

.ab-region-code {
  font-size: 11px;
  color: var(--text-secondary);
}

.ab-modal-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.ab-modal-spacer {
  flex: 1;
}

.ab-btn-ghost,
.ab-btn-primary {
  padding: 6px 12px;
  font: inherit;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}

.ab-btn-ghost {
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border);
}

.ab-btn-ghost:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.ab-btn-primary {
  color: #fff;
  background: var(--primary);
  border: 1px solid var(--primary);
}

.ab-btn-primary:disabled {
  opacity: 0.55;
  cursor: default;
}

/* 窄窗口时左栏收窄，避免挤压专辑信息 */
@media (max-width: 820px) {
  .ab-sidebar {
    width: 220px;
  }
}
</style>