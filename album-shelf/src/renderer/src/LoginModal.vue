<template>
  <div v-if="visible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h3>网易云音乐登录</h3>
        <button class="close-btn" @click="handleClose">×</button>
      </div>
      
      <div class="modal-body">
        <!-- 加载状态 -->
        <div v-if="status === 'loading'" class="status-container">
          <div class="loading-spinner"></div>
          <p>正在加载二维码...</p>
        </div>
        
        <!-- 二维码展示 -->
        <div v-else-if="status === 'waiting' || status === 'scanned'" class="qrcode-container">
          <img :src="qrcodeImageUrl" alt="登录二维码" class="qrcode-img" />
          <p class="qrcode-link-hint">
            或 <a :href="qrcodeUrl" target="_blank" class="qrcode-link">点击链接登录</a>
          </p>
          <p v-if="status === 'waiting'" class="status-text">
            请使用网易云音乐 App 扫码登录
          </p>
          <p v-else class="status-text scanned">
            已扫描，请在手机上确认登录
          </p>
        </div>
        
        <!-- 二维码过期 -->
        <div v-else-if="status === 'expired'" class="status-container">
          <p class="status-text expired">二维码已过期</p>
          <button class="refresh-btn" @click="generateQrcode">刷新二维码</button>
        </div>
        
        <!-- 错误状态 -->
        <div v-else-if="status === 'error'" class="status-container">
          <p class="status-text error">{{ errorMessage }}</p>
          <button class="refresh-btn" @click="generateQrcode">重试</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'loginSuccess'): void
}>()

type QrcodeStatus = 'loading' | 'waiting' | 'scanned' | 'expired' | 'error'

const status = ref<QrcodeStatus>('loading')
const qrcodeUrl = ref('')
const qrcodeKey = ref('')
const errorMessage = ref('')
const qrcodeCanvas = ref<HTMLCanvasElement | null>(null)
const qrcodeImageUrl = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

// 使用外部 API 生成二维码图片 URL
function getQrcodeImageUrl(text: string): string {
  // 使用 QR Server API 生成二维码图片
  const encodedText = encodeURIComponent(text)
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedText}`
}

// 生成二维码
async function generateQrcode() {
  status.value = 'loading'
  errorMessage.value = ''
  
  try {
    const result = await window.api.authGenerateQrcode()
    if (result.success && result.data) {
      qrcodeUrl.value = result.data.qrcodeUrl
      qrcodeKey.value = result.data.key || 'default'
      
      // 生成二维码图片 URL
      qrcodeImageUrl.value = getQrcodeImageUrl(result.data.qrcodeUrl)
      
      status.value = 'waiting'
      startPolling()
    } else {
      status.value = 'error'
      errorMessage.value = result.error || '生成二维码失败'
    }
  } catch (error) {
    status.value = 'error'
    errorMessage.value = '网络错误，请稍后重试'
    console.error('生成二维码失败:', error)
  }
}

// 开始轮询扫码状态
function startPolling() {
  stopPolling()
  pollTimer = setInterval(checkQrcodeStatus, 2000)
}

// 停止轮询
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 检查扫码状态
async function checkQrcodeStatus() {
  if (!qrcodeKey.value) return
  
  try {
    const result = await window.api.authCheckQrcode(qrcodeKey.value)
    if (result.success && result.data) {
      const checkResult = result.data
      
      switch (checkResult.status) {
        case 'waiting':
          status.value = 'waiting'
          break
        case 'scanned':
          status.value = 'scanned'
          break
        case 'confirmed':
          stopPolling()
          emit('loginSuccess')
          emit('close')
          break
        case 'expired':
          stopPolling()
          status.value = 'expired'
          break
      }
    }
  } catch (error) {
    console.error('检查扫码状态失败:', error)
    // 单次失败不中断轮询
  }
}

// 关闭弹窗
function handleClose() {
  stopPolling()
  emit('close')
}

// 监听 visible 变化
watch(() => props.visible, (newVal) => {
  if (newVal) {
    generateQrcode()
  } else {
    stopPolling()
    status.value = 'loading'
    qrcodeUrl.value = ''
    qrcodeKey.value = ''
  }
})

// 组件卸载时停止轮询
onUnmounted(() => {
  stopPolling()
})
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
  width: 360px;
  max-width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
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
  padding: 30px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 280px;
}

.status-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.qrcode-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qrcode-img {
  width: 200px;
  height: 200px;
  border-radius: 8px;
  border: 1px solid #eee;
}

.qrcode-link-hint {
  margin-top: 12px;
  font-size: 12px;
  color: #999;
}

.qrcode-link {
  color: #c62f2f;
  text-decoration: none;
}

.qrcode-link:hover {
  text-decoration: underline;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #c62f2f;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.status-text {
  margin-top: 16px;
  color: #666;
  font-size: 14px;
  text-align: center;
}

.status-text.scanned {
  color: #52c41a;
}

.status-text.expired {
  color: #ff4d4f;
  margin-bottom: 16px;
}

.status-text.error {
  color: #ff4d4f;
  margin-bottom: 16px;
}

.refresh-btn {
  background: #c62f2f;
  color: #fff;
  border: none;
  padding: 10px 24px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.refresh-btn:hover {
  background: #a82828;
}
</style>
