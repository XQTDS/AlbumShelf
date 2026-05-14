<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h3>修改网易云专辑 ID</h3>
        <button class="modal-close" @click="close" :disabled="fixing">×</button>
      </div>

      <div class="modal-body">
        <p class="description">
          为这张专辑指定一个新的网易云加密 album ID。请先点击「查询」预览远程信息，确认无误后再执行修复。
        </p>

        <!-- 当前专辑信息 -->
        <div class="info-block">
          <div class="info-label">当前专辑</div>
          <div class="info-row">
            <span class="info-key">标题</span>
            <span class="info-value">{{ album?.title || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">艺术家</span>
            <span class="info-value">{{ album?.artist || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">现 ID</span>
            <span class="info-value mono">{{ album?.netease_album_id || '—' }}</span>
          </div>
        </div>

        <!-- 输入新 ID -->
        <div class="input-block">
          <label class="input-label">新的网易云加密 album ID（32 位 hex）</label>
          <div class="input-row">
            <input
              v-model="newAlbumId"
              type="text"
              class="text-input mono"
              placeholder="例如：8DD3B780EF9C61D359337246F809404A"
              :disabled="querying || fixing"
              @input="onInput"
              @keydown.enter.prevent="handleQuery"
            />
            <button
              class="btn btn-secondary"
              :disabled="!canQuery || querying || fixing"
              @click="handleQuery"
            >
              {{ querying ? '查询中...' : '查询' }}
            </button>
          </div>
          <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
        </div>

        <!-- 远程预览 -->
        <div v-if="remoteDetail" class="preview-block">
          <div class="preview-label">远程详情预览</div>
          <div class="preview-body">
            <div class="preview-cover">
              <img
                v-if="remoteDetail.coverImgUrl"
                :src="remoteCoverHttps"
                class="cover-img"
              />
              <div v-else class="cover-placeholder">♫</div>
            </div>
            <div class="preview-info">
              <div class="preview-title">{{ remoteDetail.name }}</div>
              <div class="preview-artists">
                {{ remoteDetail.artists.map(a => a.name).join(' / ') || '—' }}
              </div>
              <div v-if="remoteDetail.publishTime" class="preview-date">
                发行：{{ formatDate(remoteDetail.publishTime) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-cancel" @click="close" :disabled="fixing">取消</button>
        <button
          class="btn btn-primary"
          :disabled="!remoteDetail || fixing"
          @click="handleFix"
        >
          {{ fixing ? '修复中...' : '确认修复' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface AlbumLite {
  id: number
  title: string
  artist: string
  netease_album_id: string | null
}

interface RemoteAlbumDetail {
  originalId: number
  id: string
  name: string
  coverImgUrl: string | null
  artists: { name: string }[]
  publishTime: number
}

const props = defineProps<{
  visible: boolean
  album: AlbumLite | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'fixed', payload: { albumId: number; album: unknown }): void
}>()

const newAlbumId = ref('')
const querying = ref(false)
const fixing = ref(false)
const errorMsg = ref('')
const remoteDetail = ref<RemoteAlbumDetail | null>(null)

const canQuery = computed(() => /^[0-9a-fA-F]{32}$/.test(newAlbumId.value.trim()))

const remoteCoverHttps = computed(() => {
  if (!remoteDetail.value?.coverImgUrl) return ''
  return remoteDetail.value.coverImgUrl.replace(/^http:\/\//, 'https://')
})

// 弹窗打开时重置状态
watch(
  () => props.visible,
  (v) => {
    if (v) {
      newAlbumId.value = ''
      remoteDetail.value = null
      errorMsg.value = ''
      querying.value = false
      fixing.value = false
    }
  }
)

function onInput() {
  // 输入变化后清空预览，强制用户重新查询
  remoteDetail.value = null
  errorMsg.value = ''
}

async function handleQuery() {
  const id = newAlbumId.value.trim()
  if (!id) {
    errorMsg.value = '请输入新的 album ID'
    return
  }
  if (!canQuery.value) {
    errorMsg.value = 'ID 必须是 32 位十六进制字符串'
    return
  }
  if (props.album && id.toUpperCase() === (props.album.netease_album_id || '').toUpperCase()) {
    errorMsg.value = '新 ID 与当前 ID 相同，无需修复'
    return
  }

  querying.value = true
  remoteDetail.value = null
  errorMsg.value = ''

  try {
    const result = await window.api.albumGetDetailById(id)
    if (!result.success || !result.data) {
      errorMsg.value = result.error || '未找到对应专辑，请检查 ID 是否正确'
      return
    }
    remoteDetail.value = {
      originalId: result.data.originalId,
      id: result.data.id,
      name: result.data.name,
      coverImgUrl: result.data.coverImgUrl,
      artists: result.data.artists,
      publishTime: result.data.publishTime
    }
  } catch (err) {
    errorMsg.value = (err as Error).message || '查询失败'
  } finally {
    querying.value = false
  }
}

async function handleFix() {
  if (!remoteDetail.value || !props.album) return

  fixing.value = true
  errorMsg.value = ''

  try {
    const result = await window.api.fixAlbumId({
      albumId: props.album.id,
      newNeteaseAlbumId: remoteDetail.value.id,
      newOriginalId: remoteDetail.value.originalId,
      newTitle: remoteDetail.value.name
    })
    if (!result.success) {
      errorMsg.value = result.error || '修复失败'
      return
    }
    emit('fixed', { albumId: props.album.id, album: result.data?.album })
    close()
  } catch (err) {
    errorMsg.value = (err as Error).message || '修复失败'
  } finally {
    fixing.value = false
  }
}

function close() {
  if (fixing.value) return
  emit('close')
}

function formatDate(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  width: 560px;
  max-width: 90%;
  max-height: 85vh;
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

.modal-close {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: #888;
  cursor: pointer;
  padding: 0 4px;
}

.modal-close:hover:not(:disabled) {
  color: #333;
}

.modal-close:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.description {
  margin: 0 0 16px 0;
  color: #666;
  font-size: 13px;
  line-height: 1.5;
}

.info-block,
.preview-block {
  background: #f8f8f8;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.info-label,
.preview-label {
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
  font-weight: 600;
}

.info-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
}

.info-key {
  font-size: 12px;
  color: #888;
  flex-shrink: 0;
  width: 56px;
}

.info-value {
  font-size: 14px;
  color: #333;
  word-break: break-all;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12.5px;
}

.input-block {
  margin-bottom: 16px;
}

.input-label {
  display: block;
  font-size: 13px;
  color: #555;
  margin-bottom: 8px;
}

.input-row {
  display: flex;
  gap: 8px;
}

.text-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.text-input:focus {
  border-color: #c62f2f;
}

.text-input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.error-msg {
  margin-top: 8px;
  font-size: 12px;
  color: #c62f2f;
}

.preview-body {
  display: flex;
  gap: 12px;
  align-items: center;
}

.preview-cover {
  width: 64px;
  height: 64px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eee;
  border-radius: 6px;
  color: #bbb;
  font-size: 24px;
}

.preview-info {
  flex: 1;
  min-width: 0;
}

.preview-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.preview-artists {
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
}

.preview-date {
  font-size: 12px;
  color: #999;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}

.btn {
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.btn-secondary {
  background: #eee;
  color: #333;
}

.btn-secondary:hover:not(:disabled) {
  background: #e0e0e0;
}

.btn-cancel {
  background: #f0f0f0;
  color: #555;
}

.btn-cancel:hover:not(:disabled) {
  background: #e3e3e3;
}

.btn-primary {
  background: #c62f2f;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #b02929;
}
</style>
