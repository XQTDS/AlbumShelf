<template>
  <div v-if="visible" class="modal-overlay">
    <div class="search-modal-content">
      <div class="modal-header">
        <h3>🔍 搜索专辑</h3>
        <button class="close-btn" @click="handleClose">×</button>
      </div>
      
      <div class="modal-body">
        <!-- 搜索输入框 -->
        <div class="search-input-wrapper">
          <input
            v-model="keyword"
            type="text"
            placeholder="输入专辑名或艺术家..."
            class="search-input"
            @keydown.enter="handleSearch"
            :disabled="searching"
          />
          <button 
            class="search-btn" 
            @click="handleSearch"
            :disabled="searching || !keyword.trim()"
          >
            <span v-if="searching" class="spinner small"></span>
            <span v-else>搜索</span>
          </button>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
          <button v-if="loginRequired" class="login-btn" @click="handleLoginClick">
            去登录
          </button>
        </div>

        <!-- 搜索结果 -->
        <div class="search-results" v-if="results.length > 0">
          <div 
            v-for="album in results" 
            :key="album.originalId" 
            class="result-item"
            :class="{ 'is-collected': checkCollected(album) }"
          >
            <!-- 封面 -->
            <div class="result-cover">
              <img 
                v-if="album.coverImgUrl" 
                :src="album.coverImgUrl.replace(/^http:\/\//, 'https://')" 
                :alt="album.name"
                @error="onCoverError($event)"
              />
              <div v-else class="cover-placeholder">💿</div>
            </div>
            
            <!-- 信息 -->
            <div class="result-info">
              <div class="result-title">{{ album.name }}</div>
              <div class="result-artist">
                {{ album.artists.map(a => a.name).join(' / ') }}
              </div>
              <div class="result-meta">
                <span v-if="album.publishTime">{{ formatDate(album.publishTime) }}</span>
                <span v-if="album.genre" class="result-genre">{{ album.genre }}</span>
              </div>
            </div>
            
            <!-- 添加按钮 -->
            <div class="result-action">
              <button
                v-if="checkCollected(album) || addedIds.has(album.originalId)"
                class="add-btn added"
                disabled
              >
                已收藏
              </button>
              <button
                v-else
                class="add-btn"
                :disabled="addingId === album.originalId"
                @click="handleAdd(album)"
              >
                <span v-if="addingId === album.originalId" class="spinner small"></span>
                <span v-else>+ 添加</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="searched && !searching" class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>未找到相关专辑</p>
        </div>

        <!-- 初始状态 -->
        <div v-else-if="!searching" class="initial-state">
          <div class="initial-icon">💿</div>
          <p>输入关键词搜索网易云音乐专辑</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

interface SearchAlbum {
  originalId: number
  id: string
  name: string
  coverImgUrl: string | null
  artists: { originalId: number; id: string; name: string }[]
  publishTime: number
  genre: string
}

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'added'): void
}>()

// 状态
const keyword = ref('')
const searching = ref(false)
const searched = ref(false)
const results = ref<SearchAlbum[]>([])
const errorMessage = ref('')
const loginRequired = ref(false)
const addingId = ref<number | null>(null)
const addedIds = ref<Set<number>>(new Set())
const collectedOriginalIds = ref<Set<number>>(new Set())
const collectedAlbumIds = ref<Set<string>>(new Set())

// debounce 定时器
let searchTimer: ReturnType<typeof setTimeout> | null = null

// 加载已收藏的专辑 ID
async function loadCollectedIds() {
  try {
    const result = await window.api.albumGetCollectedNeteaseIds()
    if (result.success && result.data) {
      collectedOriginalIds.value = new Set(result.data.originalIds)
      collectedAlbumIds.value = new Set(result.data.albumIds)
    }
  } catch (error) {
    console.error('加载已收藏 ID 失败:', error)
  }
}

// 检查是否已收藏（同时检查 originalId 和 加密 albumId）
function isCollected(originalId: number, albumId: string): boolean {
  return collectedOriginalIds.value.has(originalId) || collectedAlbumIds.value.has(albumId)
}

// 搜索
async function handleSearch() {
  const trimmed = keyword.value.trim()
  if (!trimmed || searching.value) return

  // debounce
  if (searchTimer) {
    clearTimeout(searchTimer)
  }

  searchTimer = setTimeout(async () => {
    searching.value = true
    searched.value = true
    errorMessage.value = ''
    loginRequired.value = false
    results.value = []

    try {
      const result = await window.api.albumSearchOnline(trimmed)
      if (result.success && result.data) {
        results.value = result.data
      } else {
        errorMessage.value = result.error || '搜索失败'
        loginRequired.value = result.loginRequired || false
      }
    } catch (error) {
      errorMessage.value = '网络错误，请稍后重试'
      console.error('搜索失败:', error)
    } finally {
      searching.value = false
    }
  }, 300) // 300ms debounce
}

// 添加专辑
async function handleAdd(album: SearchAlbum) {
  if (addingId.value) return

  addingId.value = album.originalId
  errorMessage.value = ''

  try {
    const result = await window.api.albumAddToCollection({
      netease_album_id: album.id,
      netease_original_id: album.originalId,
      title: album.name,
      artist: album.artists.map(a => a.name).join(' / '),
      cover_url: album.coverImgUrl?.replace(/^http:\/\//, 'https://') || null
    })

    if (result.success) {
      addedIds.value.add(album.originalId)
      collectedOriginalIds.value.add(album.originalId)
      collectedAlbumIds.value.add(album.id)
      emit('added')
    } else {
      errorMessage.value = result.error || '添加失败'
    }
  } catch (error) {
    errorMessage.value = '添加失败，请稍后重试'
    console.error('添加专辑失败:', error)
  } finally {
    addingId.value = null
  }
}

// 处理登录点击
function handleLoginClick() {
  handleClose()
  // 通过全局事件触发登录弹窗
  window.dispatchEvent(new CustomEvent('openLoginModal'))
}

// 关闭弹窗
function handleClose() {
  emit('close')
}

// 格式化日期
function formatDate(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return `${date.getFullYear()}`
}

// 封面加载失败
function onCoverError(event: Event) {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}

// 弹窗打开时加载已收藏 ID
watch(() => props.visible, (visible) => {
  if (visible) {
    loadCollectedIds()
    // 重置状态
    keyword.value = ''
    results.value = []
    searched.value = false
    errorMessage.value = ''
    addedIds.value = new Set()
  }
})

// 检查单个专辑是否已收藏（用于模板）
function checkCollected(album: SearchAlbum): boolean {
  return isCollected(album.originalId, album.id)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.search-modal-content {
  background: #1e1e1e;
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #333;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #888;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #fff;
}

.modal-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
}

/* 搜索输入框 */
.search-input-wrapper {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
}

.search-input:focus {
  outline: none;
  border-color: #4a9eff;
}

.search-input::placeholder {
  color: #666;
}

.search-btn {
  padding: 10px 20px;
  background: #4a9eff;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  min-width: 80px;
}

.search-btn:hover:not(:disabled) {
  background: #3a8eef;
}

.search-btn:disabled {
  background: #444;
  color: #666;
  cursor: not-allowed;
}

/* 错误提示 */
.error-message {
  padding: 10px 14px;
  background: rgba(255, 100, 100, 0.15);
  border: 1px solid rgba(255, 100, 100, 0.3);
  border-radius: 6px;
  color: #ff6b6b;
  font-size: 13px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.login-btn {
  padding: 4px 12px;
  background: #4a9eff;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

/* 搜索结果 */
.search-results {
  flex: 1;
  overflow-y: auto;
  margin: 0 -20px;
  padding: 0 20px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 8px;
  background: #2a2a2a;
  transition: background 0.15s;
}

.result-item:hover {
  background: #333;
}

.result-item.is-collected {
  opacity: 0.6;
}

/* 封面 */
.result-cover {
  width: 60px;
  height: 60px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
  background: #1a1a1a;
}

.result-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  background: #333;
}

/* 信息 */
.result-info {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.result-artist {
  font-size: 13px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.result-meta {
  font-size: 12px;
  color: #666;
  display: flex;
  gap: 8px;
}

.result-genre {
  padding: 1px 6px;
  background: #3a3a3a;
  border-radius: 3px;
}

/* 添加按钮 */
.result-action {
  flex-shrink: 0;
}

.add-btn {
  padding: 6px 14px;
  background: #4a9eff;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  min-width: 70px;
}

.add-btn:hover:not(:disabled) {
  background: #3a8eef;
}

.add-btn:disabled {
  cursor: not-allowed;
}

.add-btn.added {
  background: #2a5a2a;
  color: #8f8;
}

/* 空状态 / 初始状态 */
.empty-state,
.initial-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #666;
}

.empty-icon,
.initial-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

/* Spinner */
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}

.spinner.small {
  width: 14px;
  height: 14px;
  border-width: 2px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 滚动条样式 */
.search-results::-webkit-scrollbar {
  width: 6px;
}

.search-results::-webkit-scrollbar-track {
  background: transparent;
}

.search-results::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 3px;
}

.search-results::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
