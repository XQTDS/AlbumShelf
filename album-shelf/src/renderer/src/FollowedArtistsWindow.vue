<template>
  <div class="followed-window">
    <div class="fw-tabs">
      <button
        class="fw-tab"
        :class="{ active: tab === 'followed' }"
        @click="tab = 'followed'"
      >
        📋 关注<span class="fw-tab-count">{{ list.length }}</span>
      </button>
      <button
        class="fw-tab"
        :class="{ active: tab === 'updates' }"
        @click="tab = 'updates'"
      >
        🆕 动态<span v-if="unreadCount > 0" class="fw-tab-badge">{{ unreadCount }}</span>
      </button>
    </div>

    <!-- ==================== 关注 Tab ==================== -->
    <div v-if="tab === 'followed'" class="fw-body">
      <div v-if="loading" class="fw-empty">加载中...</div>
      <div v-else-if="list.length === 0" class="fw-empty">
        还没有关注任何艺术家。<br />
        在主界面打开专辑详情面板，点击艺术家名即可关注。
      </div>
      <div v-else class="fw-list">
        <div
          v-for="artist in list"
          :key="artist.id"
          class="fw-row"
          title="点击在主界面筛选该艺术家的专辑"
          @click="selectArtist(artist.name)"
        >
          <span class="fw-star">★</span>
          <span class="fw-name">{{ artist.name }}</span>
          <span class="fw-meta">
            {{ artist.album_count }} 张专辑 · {{ formatDate(artist.followed_at) }} 关注
          </span>
          <button
            class="fw-remove-btn"
            :disabled="removing === artist.name"
            @click.stop="unfollow(artist.name)"
          >
            {{ removing === artist.name ? '...' : '取消关注' }}
          </button>
        </div>
      </div>
      <div v-if="errorMsg" class="fw-error">{{ errorMsg }}</div>
    </div>

    <!-- ==================== 动态 Tab ==================== -->
    <template v-else>
      <div class="fw-updates-bar">
        <span class="fw-last-checked">{{ lastCheckedText }}</span>
        <div class="fw-updates-actions">
          <button
            v-if="unreadCount > 0"
            class="fw-link-btn"
            :disabled="checking"
            @click="markAllRead"
          >
            全部已读
          </button>
          <select
            v-model.number="lookbackDays"
            class="fw-lookback"
            :disabled="checking"
            title="本次检查至少回溯多久；某位艺人上次检查时间更早时，会自动扫到那个时间点"
          >
            <option v-for="opt in LOOKBACK_OPTIONS" :key="opt.days" :value="opt.days">
              {{ opt.label }}
            </option>
          </select>
          <button class="fw-check-btn" :disabled="checking" @click="runCheck">
            {{ checking ? '检查中…' : '立即检查' }}
          </button>
        </div>
      </div>

      <div v-if="checking && progress" class="fw-progress">
        <div class="fw-progress-track">
          <div
            class="fw-progress-fill"
            :style="{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }"
          ></div>
        </div>
        <span class="fw-progress-text">
          {{ progress.current }} / {{ progress.total }} · {{ progress.title }}
        </span>
      </div>

      <div class="fw-body">
        <div v-if="updatesLoading" class="fw-empty">加载中...</div>
        <div v-else-if="updates.length === 0" class="fw-empty">
          还没有发现新专辑。<br />
          选择回溯范围后点击「立即检查」拉取关注艺术家的新发行。<br />
          <span class="fw-hint">关注艺人较多时，回溯范围越大耗时越久（默认 90 天约需几分钟）。</span>
        </div>
        <div v-else class="fw-list">
          <div
            v-for="item in updates"
            :key="item.id"
            class="fw-update-row"
            :class="{ unread: !item.seen_at, participation: item.category === 'participation' }"
            @click="markRead(item)"
          >
            <span v-if="!item.seen_at" class="fw-unread-dot" title="未读"></span>

            <img
              v-if="item.cover_url && !coverFailed.has(item.id)"
              class="fw-cover"
              :src="item.cover_url"
              alt=""
              @error="coverFailed.add(item.id)"
            />
            <span v-else class="fw-cover fw-cover-placeholder">💿</span>

            <div class="fw-update-main">
              <div class="fw-update-title">{{ item.title }}</div>
              <div class="fw-update-meta">
                <span class="fw-chip" :class="item.category">
                  {{ item.category === 'own' ? '本人名下发行' : '参与作品' }}
                </span>
                <span v-if="item.track_count" class="fw-update-tracks">
                  {{ formatTrackInfo(item) }}
                </span>
                <span class="fw-update-artist">{{ item.artist_name }}</span>
                <span v-if="item.release_date" class="fw-update-date">{{ item.release_date }}</span>
              </div>
            </div>

            <a
              v-if="item.original_id"
              class="fw-netease-link"
              href="#"
              title="在网易云音乐中打开"
              @click.stop.prevent="openNetease(item)"
            >
              🎵
            </a>
          </div>
        </div>
        <div v-if="updatesNotice" class="fw-notice">{{ updatesNotice }}</div>
        <div v-if="updatesError" class="fw-error">{{ updatesError }}</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

// 本地接口（renderer tsconfig 不引入 preload/index.d.ts 全局类型，与 App.vue 的 Album 同因）
interface FollowedArtistItem {
  id: number
  name: string
  original_id: number | null
  encrypted_id: string | null
  followed_at: string
  last_checked_at: string | null
  album_count: number
}

interface ArtistUpdateItem {
  id: number
  artist_name: string
  album_id: string
  original_id: number | null
  title: string
  publish_time: number | null
  release_date: string | null
  cover_url: string | null
  category: 'own' | 'participation'
  track_count: number | null
  duration_ms: number | null
  found_at: string
  seen_at: string | null
}

interface CheckProgress {
  current: number
  total: number
  title: string
}

const tab = ref<'followed' | 'updates'>('followed')

/**
 * 回溯范围选项（天）。须与主进程 ARTIST_UPDATE_LOOKBACK_CHOICES 白名单一致，
 * 否则会被静默回落到默认 90 天。
 */
const LOOKBACK_OPTIONS = [
  { days: 30, label: '最近 30 天' },
  { days: 90, label: '最近 90 天' },
  { days: 180, label: '最近半年' },
  { days: 365, label: '最近一年' }
]
const lookbackDays = ref(90)

// ---- 关注 Tab ----
const list = ref<FollowedArtistItem[]>([])
const loading = ref(true)
const errorMsg = ref('')
/** 正在取关的艺术家名（按钮禁用态） */
const removing = ref('')

// ---- 动态 Tab ----
const updates = ref<ArtistUpdateItem[]>([])
const updatesLoading = ref(true)
const updatesError = ref('')
/** 检查完成后的统计摘要（中性提示，与错误分开展示） */
const updatesNotice = ref('')
const unreadCount = ref(0)
const lastCheckedAt = ref<string | null>(null)
const checking = ref(false)
const progress = ref<CheckProgress | null>(null)
/** 封面加载失败的条目 id（远程直链，无网络时回退占位符） */
const coverFailed = ref(new Set<number>())

let removeFollowedChangedListener: (() => void) | null = null
let removeUpdatesChangedListener: (() => void) | null = null
let removeProgressListener: (() => void) | null = null

const lastCheckedText = computed(() => {
  if (!lastCheckedAt.value) return '尚未检查过'
  const t = new Date(lastCheckedAt.value).getTime()
  if (isNaN(t)) return '尚未检查过'
  const days = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
  if (days <= 0) return '上次检查：今天'
  if (days === 1) return '上次检查：昨天'
  return `上次检查：${days} 天前`
})

async function loadList(): Promise<void> {
  try {
    const result = await window.api.artistListFollowed()
    if (result.success && result.data) {
      list.value = result.data
      errorMsg.value = ''
    } else if (result.error) {
      errorMsg.value = result.error
    }
  } catch {
    errorMsg.value = '关注列表加载失败'
  } finally {
    loading.value = false
  }
}

async function loadUpdates(): Promise<void> {
  try {
    const result = await window.api.artistUpdatesList()
    if (result.success && result.data) {
      updates.value = result.data.items
      unreadCount.value = result.data.unreadCount
      lastCheckedAt.value = result.data.lastCheckedAt
      updatesError.value = ''
    } else if (result.error) {
      updatesError.value = result.error
    }
  } catch {
    updatesError.value = '动态加载失败'
  } finally {
    updatesLoading.value = false
  }
}

/** 触发检查。主进程单飞防重入，这里的禁用态只是避免重复点击。 */
async function runCheck(): Promise<void> {
  checking.value = true
  progress.value = null
  updatesError.value = ''
  updatesNotice.value = ''
  try {
    const result = await window.api.artistUpdatesCheck(lookbackDays.value)
    if (!result.success) {
      updatesError.value = result.error || '检查失败'
      return
    }
    if (result.loginRequired) {
      updatesError.value = '需要登录网易云后才能检查新专辑'
      return
    }
    const d = result.data
    if (d) {
      if (d.total === 0) {
        updatesNotice.value = '还没有关注任何艺术家'
      } else if (d.own === 0 && d.participation === 0) {
        updatesNotice.value = '检查完成，没有发现新专辑'
      } else {
        const parts = [`新增 ${d.own} 张本人名下发行`]
        if (d.participation > 0) parts.push(`${d.participation} 张参与作品`)
        updatesNotice.value = `检查完成：${parts.join('，')}`
      }
      // 跳过与失败单独提示：这两类是「有东西没检查到」，用户需要知道
      const warns: string[] = []
      if (d.skippedNoId > 0) warns.push(`${d.skippedNoId} 位艺人缺网易云 ID，已跳过`)
      if (d.failed > 0) warns.push(`${d.failed} 位艺人检查失败，下次检查会自动补齐`)
      if (warns.length > 0) updatesError.value = warns.join('；')
    }
  } catch {
    updatesError.value = '检查失败：未知错误'
  } finally {
    checking.value = false
    progress.value = null
    await loadUpdates()
  }
}

/** 点击条目即标记已读（已读的不再重复调用） */
async function markRead(item: ArtistUpdateItem): Promise<void> {
  if (item.seen_at) return
  // 乐观更新，广播回来会覆盖为真值
  item.seen_at = new Date().toISOString()
  unreadCount.value = Math.max(0, unreadCount.value - 1)
  try {
    await window.api.artistUpdatesMarkRead(item.id)
  } catch {
    updatesError.value = '标记已读失败'
  }
}

async function markAllRead(): Promise<void> {
  try {
    await window.api.artistUpdatesMarkAllRead()
  } catch {
    updatesError.value = '标记全部已读失败'
  }
}

/** 在系统浏览器打开该专辑的网易云页面（与主界面详情面板同一实现） */
function openNetease(item: ArtistUpdateItem): void {
  if (!item.original_id) return
  window.api.openExternal(`https://music.163.com/#/album?id=${item.original_id}`)
  markRead(item)
}

/** 取关：直接调 IPC，成功后刷新（失败提示，不回滚列表） */
async function unfollow(name: string): Promise<void> {
  removing.value = name
  try {
    const result = await window.api.artistUnfollow(name)
    if (!result.success) {
      errorMsg.value = `取消关注失败：${result.error}`
      return
    }
    await loadList()
  } catch {
    errorMsg.value = '取消关注失败：未知错误'
  } finally {
    removing.value = ''
  }
}

/** 行点击：请求主窗口应用该艺术家的筛选并关闭本窗口 */
function selectArtist(name: string): void {
  window.api.artistRequestFilter(name)
  window.api.followedWindowClose()
}

/**
 * 曲目数与总时长，形如「1 首 · 3:52」「11 首 · 37:01」「23 首 · 1:12:40」。
 *
 * 单曲/EP 与正式专辑在动态流里长得一样，靠这行区分——单曲会明显地显示「1 首」。
 * track_count 为空（老数据或 album tracks 拉取失败）时整段不渲染，不显示「0 首」。
 */
function formatTrackInfo(item: ArtistUpdateItem): string {
  const count = `${item.track_count} 首`
  if (!item.duration_ms) return count

  const totalSeconds = Math.floor(item.duration_ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number): string => n.toString().padStart(2, '0')
  const duration =
    hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
  return `${count} · ${duration}`
}

/** 关注时间展示：SQLite datetime('now') 为 UTC，展示时只取日期部分 */
function formatDate(datetime: string): string {
  if (!datetime) return ''
  const d = new Date(datetime.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return datetime.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    window.api.followedWindowClose()
  }
}

onMounted(() => {
  loadList()
  loadUpdates()
  // 主窗口关注/取关后同步刷新本窗口列表
  removeFollowedChangedListener = window.api.onFollowedChanged(() => {
    loadList()
  })
  // 检查完成 / 标记已读 / 取关级联清理后刷新动态流
  removeUpdatesChangedListener = window.api.onArtistUpdatesChanged(() => {
    loadUpdates()
  })
  removeProgressListener = window.api.onArtistUpdatesProgress((p: CheckProgress) => {
    progress.value = p
  })
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  removeFollowedChangedListener?.()
  removeUpdatesChangedListener?.()
  removeProgressListener?.()
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style>
/* 独立窗口：自带设计令牌（与主界面一致的浅色主题，主界面无暗色模式） */
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
  user-select: none;
}
</style>

<style scoped>
.followed-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 14px;
}

/* ---- Tab ---- */
.fw-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
}

.fw-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}

.fw-tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.fw-tab-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}

.fw-tab-badge {
  min-width: 16px;
  padding: 1px 5px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: #d9534f;
  border-radius: 8px;
  text-align: center;
}

.fw-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fw-empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.8;
}

.fw-hint {
  font-size: 12px;
  opacity: 0.8;
}

.fw-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ---- 关注行 ---- */
.fw-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.fw-row:hover {
  border-color: var(--primary);
}

.fw-star {
  color: #e8b53a;
  flex-shrink: 0;
}

.fw-name {
  font-weight: 600;
  font-size: 14px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.fw-meta {
  flex: 1;
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fw-remove-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 12px;
  color: #d9534f;
  background: transparent;
  border: 1px solid #d9534f;
  border-radius: 4px;
  cursor: pointer;
}

.fw-remove-btn:hover:not(:disabled) {
  background: rgba(217, 83, 79, 0.08);
}

.fw-remove-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.fw-error {
  color: #d9534f;
  font-size: 12px;
  text-align: center;
  line-height: 1.6;
}

.fw-notice {
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
  line-height: 1.6;
}

/* ---- 动态工具条 ---- */
.fw-updates-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}

.fw-last-checked {
  font-size: 12px;
  color: var(--text-secondary);
}

.fw-updates-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fw-link-btn {
  padding: 4px 6px;
  font-size: 12px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-decoration: underline;
}

.fw-link-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.fw-check-btn {
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--primary);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.fw-check-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.fw-lookback {
  padding: 4px 6px;
  font-size: 12px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}

.fw-lookback:disabled {
  opacity: 0.6;
  cursor: default;
}

/* ---- 进度 ---- */
.fw-progress {
  margin-top: 8px;
}

.fw-progress-track {
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.fw-progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.2s ease;
}

.fw-progress-text {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- 动态行 ---- */
.fw-update-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.fw-update-row:hover {
  border-color: var(--primary);
}

/* 参与作品弱化：合辑/OST 占实测样本相当比例，不该和本人新发行抢注意力 */
.fw-update-row.participation {
  opacity: 0.72;
}

.fw-update-row.participation:hover {
  opacity: 1;
}

.fw-unread-dot {
  position: absolute;
  left: 6px;
  width: 6px;
  height: 6px;
  background: var(--primary);
  border-radius: 50%;
}

.fw-cover {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--bg);
}

.fw-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--text-secondary);
}

.fw-update-main {
  flex: 1;
  min-width: 0;
}

.fw-update-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fw-update-row.unread .fw-update-title {
  color: var(--primary);
}

.fw-update-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 0;
}

.fw-chip {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
}

.fw-chip.own {
  color: #2f6f4f;
  background: rgba(47, 111, 79, 0.1);
}

.fw-chip.participation {
  color: var(--text-secondary);
  background: rgba(108, 117, 125, 0.12);
}

.fw-update-artist {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 曲目数/时长：等宽数字，扫一眼就能认出「1 首」的单曲 */
.fw-update-tracks {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.fw-update-date {
  flex-shrink: 0;
  margin-left: auto;
}

.fw-netease-link {
  flex-shrink: 0;
  padding: 4px 6px;
  font-size: 14px;
  text-decoration: none;
  border-radius: 4px;
}

.fw-netease-link:hover {
  background: var(--bg);
}
</style>
