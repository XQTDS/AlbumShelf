<template>
  <div v-if="visible" class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <h3>确认专辑匹配</h3>
      </div>

      <div class="modal-body">
        <p class="description">
          以下专辑通过模糊匹配找到了可能的 MusicBrainz 对应项，请选择正确的匹配。
          确认后将补全评分和风格标签。
        </p>

        <div class="match-group">
          <div class="match-group-header">
            <div class="album-info">
              <span class="album-artist">{{ currentRequest?.albumArtist }}</span>
              <span class="album-title">{{ currentRequest?.albumTitle }}</span>
            </div>
            <button
              v-if="selectedMbid"
              class="clear-btn"
              @click="selectedMbid = undefined"
            >取消选择</button>
          </div>
          <div class="candidate-list">
            <div
              v-for="candidate in currentRequest?.candidates"
              :key="candidate.mbid"
              class="candidate-item"
              :class="{ selected: selectedMbid === candidate.mbid }"
              @click="toggleCandidate(candidate.mbid)"
            >
              <div class="radio">
                <div class="radio-dot" :class="{ active: selectedMbid === candidate.mbid }"></div>
              </div>
              <div class="candidate-info">
                <div class="candidate-title">{{ candidate.mbTitle }}</div>
                <div class="candidate-meta">
                  <span class="score">匹配度: {{ candidate.score }}%</span>
                  <span v-if="candidate.mbArtist !== currentRequest?.albumArtist" class="mb-artist">{{ candidate.mbArtist }}</span>
                  <span v-if="candidate.releaseDate" class="release-date">{{ candidate.releaseDate }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <div class="main-actions">
          <button class="cancel-btn" @click="handleReject">跳过</button>
          <button
            class="confirm-btn"
            :disabled="!selectedMbid"
            @click="handleConfirm"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface FuzzyCandidate {
  mbid: string
  mbTitle: string
  mbArtist: string
  score: number
  releaseDate: string | null
}

interface FuzzyConfirmRequest {
  albumId: number
  albumTitle: string
  albumArtist: string
  candidates: FuzzyCandidate[]
}

const visible = ref(false)
const currentRequest = ref<FuzzyConfirmRequest | null>(null)
const selectedMbid = ref<string | undefined>(undefined)

let cleanupListener: (() => void) | null = null

onMounted(() => {
  // 监听主进程发来的逐条确认请求
  cleanupListener = window.api.onFuzzyConfirmRequest((data: FuzzyConfirmRequest) => {
    currentRequest.value = data
    // 默认选中第一个候选
    selectedMbid.value = data.candidates.length > 0 ? data.candidates[0].mbid : undefined
    visible.value = true
  })
})

onUnmounted(() => {
  if (cleanupListener) {
    cleanupListener()
    cleanupListener = null
  }
})

function toggleCandidate(mbid: string) {
  selectedMbid.value = selectedMbid.value === mbid ? undefined : mbid
}

function handleConfirm() {
  if (!selectedMbid.value) return
  window.api.sendFuzzyConfirmReply({ mbid: selectedMbid.value })
  visible.value = false
  currentRequest.value = null
  selectedMbid.value = undefined
}

function handleReject() {
  window.api.sendFuzzyConfirmReply(null)
  visible.value = false
  currentRequest.value = null
  selectedMbid.value = undefined
}
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

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #666;
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

.match-group {
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}

.match-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #f8f8f8;
  border-bottom: 1px solid #eee;
}

.album-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.album-artist {
  font-size: 12px;
  color: #888;
}

.album-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clear-btn {
  background: none;
  border: none;
  font-size: 12px;
  color: #999;
  cursor: pointer;
  flex-shrink: 0;
  padding: 2px 6px;
}

.clear-btn:hover {
  color: #c62f2f;
}

.candidate-list {
  display: flex;
  flex-direction: column;
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

.candidate-info {
  flex: 1;
  min-width: 0;
}

.candidate-title {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.candidate-meta {
  margin-top: 3px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.score {
  font-size: 12px;
  color: #52c41a;
}

.mb-artist {
  font-size: 12px;
  color: #1890ff;
}

.release-date {
  font-size: 12px;
  color: #999;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}

.select-actions {
  display: flex;
  gap: 8px;
}

.select-btn {
  background: none;
  border: 1px solid #ddd;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #666;
  transition: all 0.2s;
}

.select-btn:hover {
  border-color: #999;
  color: #333;
}

.main-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.selected-count {
  font-size: 13px;
  color: #888;
}

.cancel-btn {
  background: none;
  border: 1px solid #ddd;
  padding: 8px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  transition: all 0.2s;
}

.cancel-btn:hover {
  border-color: #999;
  color: #333;
}

.confirm-btn {
  background: #c62f2f;
  color: #fff;
  border: none;
  padding: 8px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.confirm-btn:hover:not(:disabled) {
  background: #a82828;
}

.confirm-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>