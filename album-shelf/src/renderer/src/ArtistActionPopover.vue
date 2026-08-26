<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="artist-popover-backdrop"
      @click="$emit('close')"
      @contextmenu.prevent
    ></div>
    <div
      v-if="visible"
      class="artist-popover"
      :style="{ left: x + 'px', top: y + 'px' }"
    >
      <div class="popover-artist-name" :title="artist.name">{{ artist.name }}</div>
      <button class="popover-action" @click="$emit('toggle-follow')">
        <span class="popover-star">{{ followed ? '★' : '☆' }}</span>
        {{ followed ? '取消关注' : '关注' }}
      </button>
      <button class="popover-action" @click="$emit('filter')">
        🔍 筛选该艺术家的专辑
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { watch, onUnmounted } from 'vue'

const props = defineProps<{
  visible: boolean
  artist: { name: string; originalId: number | null; encryptedId: string | null }
  followed: boolean
  x: number
  y: number
}>()

const emit = defineEmits<{
  close: []
  'toggle-follow': []
  filter: []
}>()

// Esc / 窗口滚动时关闭（不做锚定跟随，滚动即关闭，简单可靠）
function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}
function handleScroll() {
  emit('close')
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      document.addEventListener('keydown', handleEscape)
      window.addEventListener('scroll', handleScroll, true)
    } else {
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }
)

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape)
  window.removeEventListener('scroll', handleScroll, true)
})
</script>

<style scoped>
.artist-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: transparent;
}

.artist-popover {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  background: var(--bg-panel, #ffffff);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.popover-artist-name {
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #666);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
  border-bottom: 1px solid var(--border-color, #eee);
  margin-bottom: 4px;
}

.popover-action {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  font-size: 13px;
  color: inherit;
  background: transparent;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.popover-action:hover {
  background: var(--hover-bg, rgba(0, 0, 0, 0.05));
}

.popover-star {
  width: 1em;
}
</style>
