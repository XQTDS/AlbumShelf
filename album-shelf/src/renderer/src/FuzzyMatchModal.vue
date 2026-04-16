<template>
  <div v-if="visible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h3>确认专辑匹配</h3>
        <button class="close-btn" @click="handleClose">×</button>
      </div>
      
      <div class="modal-body">
        <p class="description">
          以下专辑通过模糊匹配找到，请确认是否为同一张专辑。
          确认后将更新专辑名称并添加到收藏库。
        </p>
        
        <div class="match-list">
          <div
            v-for="(match, index) in fuzzyMatches"
            :key="index"
            class="match-item"
            :class="{ selected: selectedIndices.has(index) }"
            @click="toggleSelect(index)"
          >
            <div class="checkbox">
              <input
                type="checkbox"
                :checked="selectedIndices.has(index)"
                @click.stop
                @change="toggleSelect(index)"
              />
            </div>
            <div class="match-info">
              <div class="artist">{{ match.artist }}</div>
              <div class="title-compare">
                <span class="original-title">{{ match.originalTitle }}</span>
                <span class="arrow">→</span>
                <span class="matched-title">{{ match.matchedTitle }}</span>
              </div>
              <div class="similarity">相似度: {{ match.similarity }}%</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <div class="select-actions">
          <button class="select-btn" @click="selectAll">全选</button>
          <button class="select-btn" @click="deselectAll">全不选</button>
        </div>
        <div class="main-actions">
          <button class="cancel-btn" @click="handleClose">取消</button>
          <button
            class="confirm-btn"
            :disabled="selectedIndices.size === 0 || isConfirming"
            @click="handleConfirm"
          >
            {{ isConfirming ? '确认中...' : `确认选中 (${selectedIndices.size})` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

interface FuzzyMatch {
  originalTitle: string
  matchedTitle: string
  artist: string
  neteaseId: string
  similarity: number
}

const props = defineProps<{
  visible: boolean
  fuzzyMatches: FuzzyMatch[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirmed', count: number): void
}>()

const selectedIndices = ref<Set<number>>(new Set())
const isConfirming = ref(false)

// 当弹窗打开时，默认全选
watch(() => props.visible, (newVal) => {
  if (newVal) {
    selectAll()
  }
})

function selectAll() {
  selectedIndices.value = new Set(props.fuzzyMatches.map((_, i) => i))
}

function deselectAll() {
  selectedIndices.value = new Set()
}

function toggleSelect(index: number) {
  const newSet = new Set(selectedIndices.value)
  if (newSet.has(index)) {
    newSet.delete(index)
  } else {
    newSet.add(index)
  }
  selectedIndices.value = newSet
}

async function handleConfirm() {
  if (selectedIndices.value.size === 0) return

  isConfirming.value = true

  try {
    // 收集选中的匹配项
    const confirmedMatches = Array.from(selectedIndices.value).map(index => {
      const match = props.fuzzyMatches[index]
      return {
        originalTitle: match.originalTitle,
        matchedTitle: match.matchedTitle,
        artist: match.artist,
        neteaseId: match.neteaseId
      }
    })

    // 调用 API 确认
    const result = await window.api.syncConfirmFuzzyMatches(confirmedMatches)

    if (result.success) {
      emit('confirmed', result.data.added)
      emit('close')
    } else {
      console.error('确认失败:', result.error)
      alert(`确认失败: ${result.error}`)
    }
  } catch (error) {
    console.error('确认模糊匹配失败:', error)
    alert('确认失败，请查看控制台')
  } finally {
    isConfirming.value = false
  }
}

function handleClose() {
  if (!isConfirming.value) {
    emit('close')
  }
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
  width: 600px;
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

.match-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.match-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.match-item:hover {
  border-color: #c62f2f;
  background: #fafafa;
}

.match-item.selected {
  border-color: #c62f2f;
  background: #fff5f5;
}

.checkbox {
  padding-top: 2px;
}

.checkbox input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #c62f2f;
}

.match-info {
  flex: 1;
  min-width: 0;
}

.artist {
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
}

.title-compare {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.original-title {
  color: #999;
  text-decoration: line-through;
  font-size: 14px;
}

.arrow {
  color: #c62f2f;
  font-weight: bold;
}

.matched-title {
  color: #333;
  font-weight: 500;
  font-size: 14px;
}

.similarity {
  margin-top: 4px;
  font-size: 12px;
  color: #52c41a;
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
