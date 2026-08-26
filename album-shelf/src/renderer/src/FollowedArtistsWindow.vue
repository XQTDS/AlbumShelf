<template>
  <div class="followed-window">
    <div class="fw-header">
      <h2>📋 关注列表</h2>
      <span class="fw-count">{{ list.length }} 位</span>
    </div>

    <div class="fw-body">
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

// 本地接口（renderer tsconfig 不引入 preload/index.d.ts 全局类型，与 App.vue 的 Album 同因）
interface FollowedArtistItem {
  id: number
  name: string
  original_id: number | null
  encrypted_id: string | null
  followed_at: string
  album_count: number
}

const list = ref<FollowedArtistItem[]>([])
const loading = ref(true)
const errorMsg = ref('')
/** 正在取关的艺术家名（按钮禁用态） */
const removing = ref('')

let removeFollowedChangedListener: (() => void) | null = null

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
  // 主窗口关注/取关后同步刷新本窗口列表
  removeFollowedChangedListener = window.api.onFollowedChanged(() => {
    loadList()
  })
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  if (removeFollowedChangedListener) {
    removeFollowedChangedListener()
  }
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

.fw-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

.fw-header h2 {
  font-size: 15px;
  font-weight: 600;
}

.fw-count {
  color: var(--text-secondary);
  font-size: 12px;
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

.fw-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

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
}
</style>
