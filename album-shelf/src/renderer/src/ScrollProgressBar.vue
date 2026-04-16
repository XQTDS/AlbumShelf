<template>
  <div
    class="scroll-progress-bar"
    :class="{ 'is-scrolling': isScrolling }"
    ref="trackRef"
    @mousedown="handleTrackClick"
  >
    <div
      class="scroll-progress-thumb"
      :style="{ top: thumbTop + 'px', height: thumbHeight + 'px' }"
      @mousedown.stop="handleThumbMouseDown"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  scrollContainer: HTMLElement | null
}>()

const emit = defineEmits<{
  (e: 'seek', scrollTop: number): void
}>()

// Refs
const trackRef = ref<HTMLElement | null>(null)
const isScrolling = ref(false)
const isDragging = ref(false)

// Scroll state
const scrollTop = ref(0)
const scrollHeight = ref(0)
const clientHeight = ref(0)

// Computed thumb position and size
const thumbHeight = computed(() => {
  if (scrollHeight.value <= clientHeight.value) return 0
  const ratio = clientHeight.value / scrollHeight.value
  const trackHeight = trackRef.value?.clientHeight || 0
  return Math.max(30, ratio * trackHeight) // minimum 30px
})

const thumbTop = computed(() => {
  if (scrollHeight.value <= clientHeight.value) return 0
  const trackHeight = trackRef.value?.clientHeight || 0
  const maxScroll = scrollHeight.value - clientHeight.value
  const maxThumbTop = trackHeight - thumbHeight.value
  return (scrollTop.value / maxScroll) * maxThumbTop
})

// Scroll timeout for visual state
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

function handleScroll() {
  if (!props.scrollContainer) return
  
  scrollTop.value = props.scrollContainer.scrollTop
  scrollHeight.value = props.scrollContainer.scrollHeight
  clientHeight.value = props.scrollContainer.clientHeight
  
  isScrolling.value = true
  if (scrollTimeout) clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => {
    if (!isDragging.value) {
      isScrolling.value = false
    }
  }, 1000)
}

// Track click to jump
function handleTrackClick(e: MouseEvent) {
  if (!trackRef.value || !props.scrollContainer) return
  
  const rect = trackRef.value.getBoundingClientRect()
  const clickY = e.clientY - rect.top
  const trackHeight = rect.height
  const ratio = clickY / trackHeight
  
  const maxScroll = scrollHeight.value - clientHeight.value
  const newScrollTop = ratio * maxScroll
  
  emit('seek', newScrollTop)
}

// Thumb drag
let startY = 0
let startScrollTop = 0

function handleThumbMouseDown(e: MouseEvent) {
  isDragging.value = true
  isScrolling.value = true
  startY = e.clientY
  startScrollTop = scrollTop.value
  
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value || !trackRef.value || !props.scrollContainer) return
  
  const deltaY = e.clientY - startY
  const trackHeight = trackRef.value.clientHeight
  const maxScroll = scrollHeight.value - clientHeight.value
  const scrollRatio = deltaY / (trackHeight - thumbHeight.value)
  
  const newScrollTop = Math.max(0, Math.min(maxScroll, startScrollTop + scrollRatio * maxScroll))
  emit('seek', newScrollTop)
}

function handleMouseUp() {
  isDragging.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  
  // Fade out after drag ends
  if (scrollTimeout) clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => {
    isScrolling.value = false
  }, 1000)
}

// Watch for scrollContainer changes
watch(() => props.scrollContainer, (container, oldContainer) => {
  if (oldContainer) {
    oldContainer.removeEventListener('scroll', handleScroll)
  }
  if (container) {
    container.addEventListener('scroll', handleScroll)
    handleScroll() // Initialize
  }
}, { immediate: true })

onUnmounted(() => {
  if (props.scrollContainer) {
    props.scrollContainer.removeEventListener('scroll', handleScroll)
  }
  if (scrollTimeout) clearTimeout(scrollTimeout)
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
})
</script>

<style scoped>
.scroll-progress-bar {
  width: 6px;
  background: rgba(150, 150, 150, 0.1);
  border-radius: 3px;
  position: relative;
  cursor: pointer;
  transition: background 0.3s ease;
}

.scroll-progress-bar:hover,
.scroll-progress-bar.is-scrolling {
  background: rgba(150, 150, 150, 0.2);
}

.scroll-progress-thumb {
  position: absolute;
  left: 0;
  width: 100%;
  background: rgba(150, 150, 150, 0.3);
  border-radius: 3px;
  cursor: grab;
  transition: background 0.3s ease;
}

.scroll-progress-bar:hover .scroll-progress-thumb,
.scroll-progress-bar.is-scrolling .scroll-progress-thumb {
  background: rgba(150, 150, 150, 0.8);
}

.scroll-progress-thumb:active {
  cursor: grabbing;
}
</style>
