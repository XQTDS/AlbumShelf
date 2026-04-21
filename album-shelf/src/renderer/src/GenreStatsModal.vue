<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content genre-stats-modal">
      <div class="modal-header">
        <h3>📊 风格统计</h3>
        <button class="modal-close" @click="close">✕</button>
      </div>

      <div class="modal-body">
        <!-- 加载中 -->
        <div v-if="loading" class="stats-loading">
          <span class="spinner"></span>
          <span>加载中...</span>
        </div>

        <!-- 空状态 -->
        <div v-else-if="stats.length === 0" class="stats-empty">
          <div class="stats-empty-icon">🏷️</div>
          <p>暂无风格数据，请先同步并补全专辑信息</p>
        </div>

        <!-- 统计内容 -->
        <template v-else>
          <!-- 辅助统计信息 -->
          <div class="stats-summary">
            <div class="summary-item">
              <span class="summary-value">{{ totalAlbums }}</span>
              <span class="summary-label">收藏总数</span>
            </div>
            <div class="summary-item">
              <span class="summary-value">{{ albumsWithGenre }}</span>
              <span class="summary-label">有风格标签</span>
            </div>
            <div class="summary-item">
              <span class="summary-value">{{ stats.length }}</span>
              <span class="summary-label">风格种类</span>
            </div>
          </div>

          <p class="stats-note">
            💡 因一张专辑可能有多个风格标签，数量之和可能大于收藏总数
          </p>

          <!-- 条形图 -->
          <div class="bar-chart">
            <div
              v-for="item in displayItems"
              :key="item.name"
              class="bar-row"
              :class="{ 'bar-row-other': item.isOther }"
            >
              <div class="bar-label" :title="item.name">{{ item.name }}</div>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :class="{ 'bar-fill-other': item.isOther }"
                  :style="{ width: barWidth(item.count) }"
                ></div>
              </div>
              <div class="bar-count">{{ item.count }}</div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const TOP_N = 15

interface GenreStat {
  name: string
  count: number
}

const loading = ref(false)
const stats = ref<GenreStat[]>([])
const totalAlbums = ref(0)
const albumsWithGenre = ref(0)

// 计算展示项（Top 15 + 其他）
const displayItems = computed(() => {
  const items: (GenreStat & { isOther?: boolean })[] = []

  if (stats.value.length <= TOP_N) {
    return stats.value.map((s) => ({ ...s, isOther: false }))
  }

  // Top N
  for (let i = 0; i < TOP_N; i++) {
    items.push({ ...stats.value[i], isOther: false })
  }

  // 其他
  const otherCount = stats.value
    .slice(TOP_N)
    .reduce((sum, s) => sum + s.count, 0)
  items.push({ name: `其他 (${stats.value.length - TOP_N} 种)`, count: otherCount, isOther: true })

  return items
})

// 最大值（用于条形图比例）
const maxCount = computed(() => {
  if (displayItems.value.length === 0) return 1
  return Math.max(...displayItems.value.map((i) => i.count), 1)
})

function barWidth(count: number): string {
  return `${(count / maxCount.value) * 100}%`
}

// 打开时加载数据
watch(
  () => props.visible,
  async (v) => {
    if (v) {
      await loadStats()
    }
  }
)

async function loadStats() {
  loading.value = true
  try {
    const res = await window.api.genreStats()
    if (res.success && res.data) {
      stats.value = res.data.stats
      totalAlbums.value = res.data.totalAlbums
      albumsWithGenre.value = res.data.albumsWithGenre
    }
  } catch (err) {
    console.error('加载风格统计失败:', err)
  } finally {
    loading.value = false
  }
}

function close() {
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.genre-stats-modal {
  background: #1e1e1e;
  border-radius: 12px;
  width: 560px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
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
  font-size: 16px;
  color: #e0e0e0;
}

.modal-close {
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.modal-close:hover {
  background: #333;
  color: #fff;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

/* 加载中 */
.stats-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: #aaa;
}

.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid #555;
  border-top-color: #4fc3f7;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 空状态 */
.stats-empty {
  text-align: center;
  padding: 40px 0;
  color: #888;
}

.stats-empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.stats-empty p {
  margin: 0;
  font-size: 14px;
}

/* 辅助统计 */
.stats-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.summary-item {
  flex: 1;
  background: #2a2a2a;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}

.summary-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #4fc3f7;
}

.summary-label {
  display: block;
  font-size: 12px;
  color: #888;
  margin-top: 4px;
}

.stats-note {
  font-size: 12px;
  color: #666;
  margin: 0 0 16px 0;
}

/* 条形图 */
.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
}

.bar-label {
  width: 140px;
  min-width: 140px;
  font-size: 13px;
  color: #ccc;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-row-other .bar-label {
  color: #888;
  font-style: italic;
}

.bar-track {
  flex: 1;
  height: 20px;
  background: #2a2a2a;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4fc3f7, #29b6f6);
  border-radius: 4px;
  transition: width 0.4s ease;
  min-width: 2px;
}

.bar-fill-other {
  background: linear-gradient(90deg, #666, #555);
}

.bar-count {
  width: 36px;
  min-width: 36px;
  font-size: 13px;
  color: #aaa;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>