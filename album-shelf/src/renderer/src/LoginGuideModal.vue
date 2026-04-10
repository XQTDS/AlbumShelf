<template>
  <div v-if="visible" class="modal-overlay">
    <div class="modal-content">
      <div class="modal-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="#c62f2f" stroke-width="2"/>
          <path d="M12 7V13" stroke="#c62f2f" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="16.5" r="1" fill="#c62f2f"/>
        </svg>
      </div>
      
      <h3 class="modal-title">登录网易云音乐</h3>
      
      <p class="modal-text">
        登录后可以同步您在网易云音乐的收藏专辑，<br/>
        并获取完整的专辑和曲目信息。
      </p>
      
      <div class="modal-actions">
        <button class="btn-primary" @click="handleLogin">
          立即登录
        </button>
        <button class="btn-secondary" @click="handleLater">
          稍后再说
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'login'): void
  (e: 'later'): void
}>()

function handleLogin() {
  emit('login')
}

function handleLater() {
  emit('later')
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
  border-radius: 16px;
  width: 400px;
  max-width: 90%;
  padding: 40px 30px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-icon {
  margin-bottom: 20px;
}

.modal-title {
  margin: 0 0 16px;
  font-size: 22px;
  font-weight: 600;
  color: #333;
}

.modal-text {
  margin: 0 0 30px;
  color: #666;
  font-size: 14px;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn-primary {
  background: #c62f2f;
  color: #fff;
  border: none;
  padding: 14px 24px;
  border-radius: 25px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #a82828;
}

.btn-secondary {
  background: transparent;
  color: #666;
  border: none;
  padding: 14px 24px;
  cursor: pointer;
  font-size: 14px;
  transition: color 0.2s;
}

.btn-secondary:hover {
  color: #333;
}
</style>
