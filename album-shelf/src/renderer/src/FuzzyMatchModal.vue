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
            <div class="album-info-row">
              <div class="cover-wrapper">
                <img
                  v-if="currentRequest?.coverUrl"
                  :src="currentRequest.coverUrl"
                  class="cover-img"
                  @error="onNcmCoverError"
                />
                <div v-else class="cover-placeholder">
                  <span class="cover-placeholder-icon">♫</span>
                </div>
                <span class="cover-source">网易云</span>
              </div>
              <div class="album-info">
                <span class="album-artist">{{ currentRequest?.albumArtist }}</span>
                <span class="album-title">{{ currentRequest?.albumTitle }}</span>
              </div>
            </div>
            <button
              v-if="selectedMbid"
              class="clear-btn"
              @click="clearSelection"
            >取消选择</button>
          </div>

          <!-- 候选列表 -->
          <div v-if="currentRequest?.candidates?.length" class="candidate-list">
            <div
              v-for="candidate in currentRequest.candidates"
              :key="candidate.mbid"
              class="candidate-item"
              :class="{ selected: !manualMode && selectedMbid === candidate.mbid }"
              @click="selectCandidate(candidate.mbid)"
            >
              <div class="radio">
                <div class="radio-dot" :class="{ active: !manualMode && selectedMbid === candidate.mbid }"></div>
              </div>
              <div class="cover-wrapper cover-wrapper-sm">
                <img
                  v-if="!coverErrors[candidate.mbid]"
                  :src="getMbCoverUrl(candidate.mbid)"
                  class="cover-img"
                  @error="onMbCoverError(candidate.mbid)"
                />
                <div v-else class="cover-placeholder">
                  <span class="cover-placeholder-icon">♫</span>
                </div>
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

          <!-- 手动指定 MusicBrainz 链接 -->
          <div class="manual-input-section">
            <div class="manual-input-label">手动指定 MusicBrainz 链接</div>
            <div class="manual-input-row">
              <input
                v-model="manualUrl"
                type="text"
                class="manual-input"
                placeholder="粘贴 release-group 链接或 MBID"
                @input="onManualInput"
              />
              <div v-if="manualMode && parsedManualMbid" class="manual-cover-wrapper cover-wrapper-sm">
                <img
                  v-if="!coverErrors[parsedManualMbid]"
                  :src="getMbCoverUrl(parsedManualMbid)"
                  class="cover-img"
                  @error="onMbCoverError(parsedManualMbid)"
                />
                <div v-else class="cover-placeholder">
                  <span class="cover-placeholder-icon">♫</span>
                </div>
              </div>
            </div>
            <div v-if="manualUrl && !parsedManualMbid" class="manual-input-error">
              无法识别链接，请粘贴类似 https://musicbrainz.org/release-group/xxxx 的链接或直接输入 MBID
            </div>
            <div v-if="manualMode && parsedManualMbid" class="manual-input-hint">
              ✓ 已识别 MBID: {{ parsedManualMbid.substring(0, 8) }}...
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
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'

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
  coverUrl: string | null
  candidates: FuzzyCandidate[]
}

const visible = ref(false)
const currentRequest = ref<FuzzyConfirmRequest | null>(null)
const selectedMbid = ref<string | undefined>(undefined)
const coverErrors = reactive<Record<string, boolean>>({})

// 手动输入相关
const manualUrl = ref('')
const manualMode = ref(false) // 是否处于手动指定模式

let cleanupListener: (() => void) | null = null

/** UUID v4 格式正则 */
const MBID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 从用户输入中解析 MusicBrainz release-group MBID
 * 支持：
 * - 完整 URL: https://musicbrainz.org/release-group/{mbid}
 * - 带查询参数的 URL: https://musicbrainz.org/release-group/{mbid}?...
 * - 直接粘贴 MBID: 6edde49b-af91-40dc-8c74-c654ec80ff81
 */
const parsedManualMbid = computed<string | null>(() => {
  const input = manualUrl.value.trim()
  if (!input) return null

  // 直接粘贴 MBID
  if (MBID_REGEX.test(input)) {
    return input.toLowerCase()
  }

  // URL 格式解析
  try {
    const url = new URL(input)
    // 匹配 /release-group/{mbid} 路径
    const match = url.pathname.match(/\/release-group\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
    if (match) {
      return match[1].toLowerCase()
    }
  } catch {
    // 不是合法 URL，忽略
  }

  return null
})

onMounted(() => {
  cleanupListener = window.api.onFuzzyConfirmRequest((data: FuzzyConfirmRequest) => {
    currentRequest.value = data
    selectedMbid.value = data.candidates.length > 0 ? data.candidates[0].mbid : undefined
    manualUrl.value = ''
    manualMode.value = false
    Object.keys(coverErrors).forEach((key) => delete coverErrors[key])
    visible.value = true
  })
})

onUnmounted(() => {
  if (cleanupListener) {
    cleanupListener()
    cleanupListener = null
  }
})

function getMbCoverUrl(mbid: string): string {
  return `https://coverartarchive.org/release-group/${mbid}/front-250`
}

function onNcmCoverError(event: Event) {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}

function onMbCoverError(mbid: string) {
  coverErrors[mbid] = true
}

/** 从候选列表中选择 */
function selectCandidate(mbid: string) {
  manualMode.value = false
  manualUrl.value = ''
  selectedMbid.value = selectedMbid.value === mbid ? undefined : mbid
}

/** 手动输入框变化时 */
function onManualInput() {
  const mbid = parsedManualMbid.value
  if (mbid) {
    manualMode.value = true
    selectedMbid.value = mbid
  } else if (manualUrl.value.trim()) {
    // 输入了内容但无法解析
    manualMode.value = true
    selectedMbid.value = undefined
  } else {
    // 输入为空，恢复到候选模式
    manualMode.value = false
    // 恢复默认选中第一个候选
    selectedMbid.value = currentRequest.value?.candidates?.[0]?.mbid
  }
}

/** 清除所有选择 */
function clearSelection() {
  selectedMbid.value = undefined
  manualUrl.value = ''
  manualMode.value = false
}

function handleConfirm() {
  if (!selectedMbid.value) return
  window.api.sendFuzzyConfirmReply({ mbid: selectedMbid.value })
  visible.value = false
  currentRequest.value = null
  selectedMbid.value = undefined
  manualUrl.value = ''
  manualMode.value = false
}

function handleReject() {
  window.api.sendFuzzyConfirmReply(null)
  visible.value = false
  currentRequest.value = null
  selectedMbid.value = undefined
  manualUrl.value = ''
  manualMode.value = false
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

.album-info-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

/* 封面通用样式 */
.cover-wrapper {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  position: relative;
}

.cover-wrapper-sm {
  width: 54px;
  height: 54px;
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
  font-size: 20px;
  color: #bbb;
}

.cover-wrapper-sm .cover-placeholder-icon {
  font-size: 18px;
}

.cover-source {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1.3;
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

/* 手动指定区域 */
.manual-input-section {
  padding: 12px 14px;
  border-top: 1px solid #eee;
  background: #fcfcfc;
}

.manual-input-label {
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
}

.manual-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.manual-input {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  color: #333;
  outline: none;
  transition: border-color 0.2s;
}

.manual-input:focus {
  border-color: #c62f2f;
}

.manual-input::placeholder {
  color: #bbb;
}

.manual-cover-wrapper {
  flex-shrink: 0;
}

.manual-input-error {
  margin-top: 4px;
  font-size: 11px;
  color: #e65c5c;
  line-height: 1.4;
}

.manual-input-hint {
  margin-top: 4px;
  font-size: 11px;
  color: #52c41a;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}

.main-actions {
  display: flex;
  align-items: center;
  gap: 12px;
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