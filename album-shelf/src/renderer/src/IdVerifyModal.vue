<template>
  <div v-if="visible" class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <h3>校验专辑 ID</h3>
        <span v-if="phase === 'verifying'" class="header-progress">
          {{ verifyProgress.current }} / {{ verifyProgress.total }}
        </span>
        <span v-else-if="phase === 'confirm'" class="header-progress">
          {{ currentIndex + 1 }} / {{ mismatches.length }}
        </span>
      </div>

      <div class="modal-body">
        <!-- Phase 1: 校验中 -->
        <div v-if="phase === 'verifying'" class="verifying-section">
          <p class="description">正在校验所有专辑的网易云 ID 是否正确...</p>
          <div class="progress-bar-wrapper">
            <div class="progress-bar">
              <div
                class="progress-bar-fill"
                :style="{ width: progressPercent + '%' }"
              ></div>
            </div>
            <span class="progress-text">{{ verifyProgress.current }} / {{ verifyProgress.total }}</span>
          </div>
        </div>

        <!-- Phase 2: 校验完成，无不匹配 -->
        <div v-else-if="phase === 'done-clean'" class="done-section">
          <div class="done-icon">✓</div>
          <p class="done-text">所有专辑的网易云 ID 均正确，无需修复。</p>
          <p v-if="errors.length > 0" class="done-warning">
            ⚠️ {{ errors.length }} 张专辑校验失败（网络错误等），请稍后重试。
          </p>
        </div>

        <!-- Phase 3: 逐个确认 -->
        <div v-else-if="phase === 'confirm'" class="confirm-section">
          <p class="description">
            发现 {{ mismatches.length }} 张专辑的 ID 不匹配，请逐个确认修复。
          </p>

          <div class="mismatch-info">
            <div class="mismatch-row">
              <span class="mismatch-label">本地：</span>
              <span class="mismatch-value">{{ currentMismatch.localTitle }}</span>
              <span class="mismatch-artist">— {{ currentMismatch.localArtist }}</span>
            </div>
            <div class="mismatch-row mismatch-remote">
              <span class="mismatch-label">远程：</span>
              <span class="mismatch-value">{{ currentMismatch.remoteTitle }}</span>
              <span class="mismatch-artist">— {{ currentMismatch.remoteArtist }}</span>
            </div>
          </div>

          <!-- 搜索候选 -->
          <div class="search-section">
            <div class="search-header">
              <span class="search-title">搜索候选</span>
              <span v-if="searching" class="search-loading">搜索中...</span>
            </div>

            <div v-if="candidates.length > 0" class="candidate-list">
              <div
                v-for="(candidate, idx) in candidates"
                :key="candidate.id"
                class="candidate-item"
                :class="{ selected: selectedIndex === idx }"
                @click="selectedIndex = idx"
              >
                <div class="radio">
                  <div class="radio-dot" :class="{ active: selectedIndex === idx }"></div>
                </div>
                <div class="candidate-cover">
                  <img
                    v-if="candidate.coverImgUrl"
                    :src="candidate.coverImgUrl"
                    class="cover-img"
                  />
                  <div v-else class="cover-placeholder">
                    <span class="cover-placeholder-icon">♫</span>
                  </div>
                </div>
                <div class="candidate-info">
                  <div class="candidate-title">{{ candidate.name }}</div>
                  <div class="candidate-meta">
                    <span class="candidate-artist">{{ candidate.artists.map(a => a.name).join(' / ') }}</span>
                    <span v-if="candidate.publishTime" class="candidate-date">{{ formatDate(candidate.publishTime) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="!searching && searchDone" class="no-results">
              未找到匹配的专辑
            </div>
          </div>

          <!-- 手动输入 album ID -->
          <div class="manual-input-section">
            <div class="manual-input-label">手动指定网易云专辑 ID</div>
            <div class="manual-input-row">
              <input
                v-model="manualAlbumId"
                type="text"
                class="manual-input"
                placeholder="粘贴网易云专辑 ID（数字）"
                @input="onManualInput"
              />
              <button
                class="manual-query-btn"
                :disabled="!manualAlbumId.trim() || manualQuerying"
                @click="queryManualAlbumId"
              >
                {{ manualQuerying ? '查询中...' : '查询' }}
              </button>
            </div>
            <div v-if="manualResult" class="manual-result">
              <div class="manual-result-info">
                <span class="manual-result-title">{{ manualResult.name }}</span>
                <span class="manual-result-artist">— {{ manualResult.artists.map(a => a.name).join(' / ') }}</span>
              </div>
              <button class="manual-use-btn" @click="useManualResult">使用此结果修复</button>
            </div>
            <div v-if="manualError" class="manual-input-error">{{ manualError }}</div>
          </div>
        </div>

        <!-- Phase 4: 修复完成 -->
        <div v-else-if="phase === 'done-fixed'" class="done-section">
          <div class="done-icon">✓</div>
          <p class="done-text">修复完成！已修复 {{ fixedCount }} 张专辑，跳过 {{ skippedCount }} 张。</p>
        </div>
      </div>

      <div class="modal-footer">
        <div v-if="phase === 'verifying'" class="main-actions">
          <button class="cancel-btn" @click="close">取消</button>
        </div>
        <div v-else-if="phase === 'done-clean' || phase === 'done-fixed'" class="main-actions">
          <button class="confirm-btn" @click="close">关闭</button>
        </div>
        <div v-else-if="phase === 'confirm'" class="main-actions">
          <button class="cancel-btn" @click="handleSkip">跳过</button>
          <button
            class="confirm-btn"
            :disabled="selectedIndex === null || fixing"
            @click="handleFix"
          >
            {{ fixing ? '修复中...' : '确认修复' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

interface MismatchItem {
  albumId: number
  localTitle: string
  localArtist: string
  remoteTitle: string
  remoteArtist: string
  neteaseAlbumId: string
}

interface ErrorItem {
  albumId: number
  localTitle: string
  localArtist: string
  error: string
}

interface SearchCandidate {
  originalId: number
  id: string
  name: string
  coverImgUrl: string | null
  artists: { originalId: number; id: string; name: string }[]
  publishTime: number
}

const emit = defineEmits<{
  (e: 'done'): void
}>()

const visible = ref(false)
const phase = ref<'verifying' | 'done-clean' | 'confirm' | 'done-fixed'>('verifying')
const verifyProgress = ref({ current: 0, total: 0 })
const mismatches = ref<MismatchItem[]>([])
const errors = ref<ErrorItem[]>([])
const currentIndex = ref(0)
const candidates = ref<SearchCandidate[]>([])
const selectedIndex = ref<number | null>(null)
const searching = ref(false)
const searchDone = ref(false)
const fixing = ref(false)
const fixedCount = ref(0)
const skippedCount = ref(0)

// 手动输入相关
const manualAlbumId = ref('')
const manualQuerying = ref(false)
const manualResult = ref<{ originalId: number; id: string; name: string; artists: { name: string }[] } | null>(null)
const manualError = ref('')

let cleanupProgress: (() => void) | null = null

const progressPercent = computed(() => {
  if (verifyProgress.value.total === 0) return 0
  return Math.round((verifyProgress.value.current / verifyProgress.value.total) * 100)
})

const currentMismatch = computed(() => mismatches.value[currentIndex.value])

onMounted(() => {
  cleanupProgress = window.api.onVerifyProgress((progress) => {
    verifyProgress.value = progress
  })
})

onUnmounted(() => {
  if (cleanupProgress) {
    cleanupProgress()
    cleanupProgress = null
  }
})

// 当进入某个 mismatch 时自动搜索候选
watch(currentIndex, () => {
  if (phase.value === 'confirm') {
    searchCandidates()
  }
})

async function startVerify() {
  visible.value = true
  phase.value = 'verifying'
  verifyProgress.value = { current: 0, total: 0 }
  mismatches.value = []
  errors.value = []
  currentIndex.value = 0
  fixedCount.value = 0
  skippedCount.value = 0

  const result = await window.api.verifyAlbumIds()

  if (!result.success || !result.data) {
    alert(result.error || '校验失败')
    visible.value = false
    return
  }

  mismatches.value = result.data.mismatches
  errors.value = result.data.errors

  if (mismatches.value.length === 0) {
    phase.value = 'done-clean'
  } else {
    phase.value = 'confirm'
    searchCandidates()
  }
}

async function searchCandidates() {
  if (!currentMismatch.value) return

  searching.value = true
  searchDone.value = false
  candidates.value = []
  selectedIndex.value = null
  manualAlbumId.value = ''
  manualResult.value = null
  manualError.value = ''

  const keyword = `${currentMismatch.value.localTitle} ${currentMismatch.value.localArtist}`
  const result = await window.api.albumSearchOnline(keyword)

  searching.value = false
  searchDone.value = true

  if (result.success && result.data) {
    candidates.value = result.data as SearchCandidate[]
    // 自动选中第一个
    if (candidates.value.length > 0) {
      selectedIndex.value = 0
    }
  }
}

function onManualInput() {
  manualResult.value = null
  manualError.value = ''
}

async function queryManualAlbumId() {
  if (!manualAlbumId.value.trim() || !currentMismatch.value) return

  manualQuerying.value = true
  manualResult.value = null
  manualError.value = ''

  // 使用 ncm-cli album get --albumId 直接查询专辑详情
  const result = await window.api.albumGetDetailById(manualAlbumId.value.trim())

  manualQuerying.value = false

  if (!result.success || !result.data) {
    manualError.value = result.error || '未找到对应专辑，请检查 ID 是否正确'
    return
  }

  manualResult.value = {
    originalId: result.data.originalId,
    id: result.data.id,
    name: result.data.name,
    artists: result.data.artists
  }
}

async function useManualResult() {
  if (!manualResult.value || !currentMismatch.value) return

  fixing.value = true

  const result = await window.api.fixAlbumId({
    albumId: currentMismatch.value.albumId,
    newNeteaseAlbumId: manualResult.value.id,
    newOriginalId: manualResult.value.originalId,
    newTitle: manualResult.value.name
  })

  fixing.value = false

  if (!result.success) {
    alert(`修复失败: ${result.error}`)
    return
  }

  fixedCount.value++
  manualAlbumId.value = ''
  manualResult.value = null
  manualError.value = ''
  moveToNext()
}

async function handleFix() {
  if (selectedIndex.value === null || !currentMismatch.value) return

  const candidate = candidates.value[selectedIndex.value]
  fixing.value = true

  const result = await window.api.fixAlbumId({
    albumId: currentMismatch.value.albumId,
    newNeteaseAlbumId: candidate.id,
    newOriginalId: candidate.originalId,
    newTitle: candidate.name
  })

  fixing.value = false

  if (!result.success) {
    alert(`修复失败: ${result.error}`)
    return
  }

  fixedCount.value++
  moveToNext()
}

function handleSkip() {
  skippedCount.value++
  moveToNext()
}

function moveToNext() {
  if (currentIndex.value < mismatches.value.length - 1) {
    currentIndex.value++
  } else {
    phase.value = 'done-fixed'
    emit('done')
  }
}

function close() {
  visible.value = false
  if (fixedCount.value > 0) {
    emit('done')
  }
}

function formatDate(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Expose startVerify to parent
defineExpose({ startVerify })
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  width: 650px;
  max-width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.header-progress {
  font-size: 13px;
  color: #888;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.description {
  margin: 0 0 16px 0;
  color: #666;
  font-size: 14px;
  line-height: 1.5;
}

/* 进度条 */
.progress-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: #c62f2f;
  border-radius: 4px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 13px;
  color: #888;
  white-space: nowrap;
}

/* 完成状态 */
.done-section {
  text-align: center;
  padding: 30px 0;
}

.done-icon {
  font-size: 48px;
  color: #4caf50;
  margin-bottom: 12px;
}

.done-text {
  font-size: 15px;
  color: #333;
  margin: 0;
}

.done-warning {
  font-size: 13px;
  color: #f57c00;
  margin-top: 8px;
}

/* 不匹配信息 */
.mismatch-info {
  background: #f8f8f8;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.mismatch-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
}

.mismatch-remote {
  color: #c62f2f;
}

.mismatch-label {
  font-size: 12px;
  color: #888;
  flex-shrink: 0;
  width: 40px;
}

.mismatch-value {
  font-size: 14px;
  font-weight: 600;
  color: inherit;
}

.mismatch-artist {
  font-size: 13px;
  color: #888;
}

/* 搜索 */
.search-section {
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}

.search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #f8f8f8;
  border-bottom: 1px solid #eee;
}

.search-title {
  font-size: 13px;
  font-weight: 600;
  color: #555;
}

.search-loading {
  font-size: 12px;
  color: #888;
}

.candidate-list {
  display: flex;
  flex-direction: column;
  max-height: 280px;
  overflow-y: auto;
}

.candidate-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid #f0f0f0;
}

.candidate-item:last-child {
  border-bottom: none;
}

.candidate-item:hover {
  background: #fafafa;
}

.candidate-item.selected {
  background: #fff5f5;
}

.radio {
  width: 18px;
  height: 18px;
  border: 2px solid #ccc;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.15s;
}

.candidate-item.selected .radio {
  border-color: #c62f2f;
}

.radio-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: transparent;
  transition: background 0.15s;
}

.radio-dot.active {
  background: #c62f2f;
}

.candidate-cover {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  background: #f0f0f0;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  background: #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-placeholder-icon {
  font-size: 18px;
  color: #bbb;
}

.candidate-info {
  flex: 1;
  min-width: 0;
}

.candidate-title {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.candidate-meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 12px;
  color: #888;
}

.candidate-artist {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.candidate-date {
  flex-shrink: 0;
}

.no-results {
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 13px;
}

/* 手动输入 */
.manual-input-section {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  background: #fafafa;
}

.manual-input-label {
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin-bottom: 8px;
}

.manual-input-row {
  display: flex;
  gap: 8px;
}

.manual-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.manual-input:focus {
  border-color: #c62f2f;
}

.manual-query-btn {
  padding: 8px 14px;
  border: none;
  border-radius: 6px;
  background: #555;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.manual-query-btn:hover:not(:disabled) {
  background: #333;
}

.manual-query-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.manual-result {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}

.manual-result-info {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.manual-result-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.manual-result-artist {
  font-size: 13px;
  color: #888;
}

.manual-use-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 5px;
  background: #c62f2f;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s;
}

.manual-use-btn:hover {
  background: #a82525;
}

.manual-input-error {
  margin-top: 6px;
  font-size: 12px;
  color: #e53935;
}

/* Footer */
.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}

.main-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.cancel-btn {
  padding: 8px 18px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #666;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.cancel-btn:hover {
  border-color: #ccc;
  background: #f8f8f8;
}

.confirm-btn {
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  background: #c62f2f;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.confirm-btn:hover:not(:disabled) {
  background: #a82525;
}

.confirm-btn:disabled {
  background: #ddd;
  color: #999;
  cursor: not-allowed;
}
</style>
