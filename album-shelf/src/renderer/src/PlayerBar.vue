<script setup lang="ts">
/**
 * 底部常驻播放条：封面、歌曲/艺术家/专辑信息、播控按钮与可点可拖进度条。
 * 状态与命令均由父组件（App.vue）持有与派发，本组件只负责展示与交互反馈。
 */
import { computed, ref, watch, onUnmounted } from 'vue'

const props = defineProps<{
  albumId: number | null
  albumTitle: string
  /** 专辑原始封面 URL（cover:// 协议失败时回退用） */
  coverUrl: string | null
  trackTitle: string
  trackArtist: string
  status: 'stopped' | 'playing' | 'paused' | 'unknown'
  /** 展示进度（秒，父组件已做轮询间隔内插值） */
  position: number
  duration: number
  /** 当前音量 0-100（应用本地管理，父组件持有） */
  volume: number
}>()

const emit = defineEmits<{
  toggle: []
  next: []
  prev: []
  seek: [seconds: number]
  volume: [level: number]
  muteToggle: []
  stop: []
}>()

const isPlaying = computed(() => props.status === 'playing')

// ==================== 封面（cover:// 优先，失败回退远程 URL） ====================

const coverProtocolFailed = ref(false)

// 切换专辑时重置回退状态（新专辑重新尝试 cover://）
watch(
  () => props.albumId,
  () => {
    coverProtocolFailed.value = false
  }
)

const coverSrc = computed<string | null>(() => {
  if (!props.coverUrl) return null
  if (props.albumId !== null && !coverProtocolFailed.value) {
    return `cover://album/${props.albumId}`
  }
  return props.coverUrl
})

// ==================== 时间格式化 ====================

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ==================== 进度条（点击/拖动跳转） ====================

const progressEl = ref<HTMLElement | null>(null)
const dragging = ref(false)
const dragPosition = ref(0)

const displayPosition = computed(() =>
  dragging.value ? dragPosition.value : props.position
)

const progressPercent = computed(() => {
  if (!props.duration || props.duration <= 0) return 0
  return Math.min(100, Math.max(0, (displayPosition.value / props.duration) * 100))
})

function ratioFromEvent(e: PointerEvent): number {
  const el = progressEl.value
  if (!el || !props.duration || props.duration <= 0) return 0
  const rect = el.getBoundingClientRect()
  return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
}

function onProgressDown(e: PointerEvent): void {
  if (!props.duration || props.duration <= 0) return
  dragging.value = true
  dragPosition.value = ratioFromEvent(e) * props.duration
  progressEl.value?.setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onProgressMove)
  window.addEventListener('pointerup', onProgressUp)
}

function onProgressMove(e: PointerEvent): void {
  if (!dragging.value) return
  dragPosition.value = ratioFromEvent(e) * props.duration
}

function onProgressUp(e: PointerEvent): void {
  if (!dragging.value) return
  dragging.value = false
  window.removeEventListener('pointermove', onProgressMove)
  window.removeEventListener('pointerup', onProgressUp)
  emit('seek', ratioFromEvent(e) * props.duration)
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onProgressMove)
  window.removeEventListener('pointerup', onProgressUp)
  window.removeEventListener('pointermove', onVolumeMove)
  window.removeEventListener('pointerup', onVolumeUp)
})

// ==================== 音量（拖动本地预览，释放时提交） ====================

const volumeEl = ref<HTMLElement | null>(null)
const volumeDragging = ref(false)
const dragVolume = ref(0)

const displayVolume = computed(() =>
  volumeDragging.value ? dragVolume.value : props.volume
)

const volumePercent = computed(() =>
  Math.min(100, Math.max(0, displayVolume.value))
)

/** 图标按音量档位：静音 / 低 / 中 / 高 */
const volumeIcon = computed(() => {
  const v = displayVolume.value
  if (v <= 0) return '🔇'
  if (v < 34) return '🔈'
  if (v < 67) return '🔉'
  return '🔊'
})

function volumeRatioFromEvent(e: PointerEvent): number {
  const el = volumeEl.value
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
}

function onVolumeDown(e: PointerEvent): void {
  volumeDragging.value = true
  dragVolume.value = volumeRatioFromEvent(e) * 100
  volumeEl.value?.setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onVolumeMove)
  window.addEventListener('pointerup', onVolumeUp)
}

function onVolumeMove(e: PointerEvent): void {
  if (!volumeDragging.value) return
  dragVolume.value = volumeRatioFromEvent(e) * 100
}

function onVolumeUp(e: PointerEvent): void {
  if (!volumeDragging.value) return
  volumeDragging.value = false
  window.removeEventListener('pointermove', onVolumeMove)
  window.removeEventListener('pointerup', onVolumeUp)
  emit('volume', Math.round(volumeRatioFromEvent(e) * 100))
}
</script>

<template>
  <footer class="player-bar">
    <!-- 封面 -->
    <div class="player-cover">
      <img
        v-if="coverSrc"
        :src="coverSrc"
        alt=""
        draggable="false"
        @error="coverProtocolFailed = true"
      />
      <span v-else class="player-cover-placeholder">💿</span>
    </div>

    <!-- 曲目信息 -->
    <div class="player-info">
      <div class="player-title-line">
        <span class="player-track">{{ trackTitle || '—' }}</span>
        <span v-if="trackArtist" class="player-artist">{{ trackArtist }}</span>
      </div>
      <div class="player-album">{{ albumTitle || '—' }}</div>
    </div>

    <!-- 播控按钮 -->
    <div class="player-controls">
      <button class="player-btn" title="上一首" @click="emit('prev')">⏮</button>
      <button
        class="player-btn player-btn-main"
        :title="isPlaying ? '暂停' : '播放'"
        @click="emit('toggle')"
      >
        {{ isPlaying ? '⏸' : '▶' }}
      </button>
      <button class="player-btn" title="下一首" @click="emit('next')">⏭</button>
    </div>

    <!-- 进度 -->
    <span class="player-time">{{ formatTime(displayPosition) }}</span>
    <div ref="progressEl" class="player-progress" @pointerdown="onProgressDown">
      <div class="player-progress-track">
        <div class="player-progress-fill" :style="{ width: progressPercent + '%' }"></div>
        <div class="player-progress-thumb" :style="{ left: progressPercent + '%' }"></div>
      </div>
    </div>
    <span class="player-time">{{ formatTime(duration) }}</span>

    <!-- 音量：图标点击静音切换，窄滑块拖动调音量 -->
    <div class="player-volume">
      <button
        class="player-btn player-volume-btn"
        :title="props.volume > 0 ? '静音' : '恢复音量'"
        @click="emit('muteToggle')"
      >
        {{ volumeIcon }}
      </button>
      <div ref="volumeEl" class="player-volume-slider" @pointerdown="onVolumeDown">
        <div class="player-volume-track">
          <div class="player-volume-fill" :style="{ width: volumePercent + '%' }"></div>
          <div class="player-volume-thumb" :style="{ left: volumePercent + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 停止 -->
    <button class="player-btn" title="停止播放" @click="emit('stop')">✕</button>
  </footer>
</template>

<style scoped>
.player-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.06);
  z-index: 10;
}

.player-cover {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
}

.player-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-cover-placeholder {
  font-size: 20px;
}

.player-info {
  flex-shrink: 1;
  min-width: 0;
  max-width: 320px;
}

.player-title-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.player-track {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-artist {
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-album {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-controls {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.player-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.player-btn:hover {
  background: var(--bg);
}

.player-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.player-btn-main {
  width: 36px;
  height: 36px;
  background: var(--primary);
  color: #fff;
  font-size: 15px;
}

.player-btn-main:hover {
  background: var(--primary-hover);
}

.player-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 34px;
  text-align: center;
}

.player-progress {
  flex: 1;
  min-width: 80px;
  display: flex;
  align-items: center;
  height: 24px; /* 扩大点击热区 */
  cursor: pointer;
  touch-action: none;
}

.player-progress-track {
  position: relative;
  width: 100%;
  height: 5px;
  border-radius: 3px;
  background: var(--border);
  overflow: visible;
}

.player-progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 3px;
  background: var(--primary);
}

.player-progress-thumb {
  position: absolute;
  top: 50%;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--primary);
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s;
}

.player-progress:hover .player-progress-thumb {
  opacity: 1;
}

.player-volume {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.player-volume-btn {
  width: 28px;
  height: 28px;
  font-size: 13px;
}

.player-volume-slider {
  width: 80px;
  display: flex;
  align-items: center;
  height: 24px; /* 扩大点击热区 */
  cursor: pointer;
  touch-action: none;
}

.player-volume-track {
  position: relative;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  overflow: visible;
}

.player-volume-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 2px;
  background: var(--primary);
}

.player-volume-thumb {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary);
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s;
}

.player-volume-slider:hover .player-volume-thumb {
  opacity: 1;
}
</style>
