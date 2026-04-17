<template>
  <div v-if="visible" class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <h3>匹配策略设置</h3>
      </div>

      <div class="modal-body">
        <p class="description">
          控制 MusicBrainz 匹配时使用的搜索策略。关闭某个策略后，补全时将跳过对应的查询。
        </p>

        <div class="strategy-group">
          <div class="group-title">精确匹配策略</div>
          <label class="strategy-row">
            <input
              type="checkbox"
              v-model="form.Q1_fullTitleFullArtist"
              class="strategy-checkbox"
            />
            <div class="strategy-info">
              <span class="strategy-name">Q1: 完整标题 + 完整艺术家</span>
              <span class="strategy-desc">最精确的匹配方式</span>
            </div>
          </label>
          <label class="strategy-row">
            <input
              type="checkbox"
              v-model="form.Q2_fullTitleFirstArtist"
              class="strategy-checkbox"
            />
            <div class="strategy-info">
              <span class="strategy-name">Q2: 完整标题 + 第一艺术家</span>
              <span class="strategy-desc">处理多艺术家场景</span>
            </div>
          </label>
          <label class="strategy-row">
            <input
              type="checkbox"
              v-model="form.Q3_titleFirstWordFirstArtist"
              class="strategy-checkbox"
            />
            <div class="strategy-info">
              <span class="strategy-name">Q3: 标题首词 + 第一艺术家</span>
              <span class="strategy-desc">处理简繁体/标点差异</span>
            </div>
          </label>
        </div>

        <div class="strategy-group">
          <div class="group-title">模糊匹配策略</div>
          <label class="strategy-row">
            <input
              type="checkbox"
              v-model="form.F1_removeArtistPrefix"
              class="strategy-checkbox"
            />
            <div class="strategy-info">
              <span class="strategy-name">F1: 去除艺术家名前缀</span>
              <span class="strategy-desc">标题含艺术家名时有效</span>
            </div>
          </label>
          <label class="strategy-row">
            <input
              type="checkbox"
              v-model="form.F2_removeParenSuffix"
              class="strategy-checkbox"
            />
            <div class="strategy-info">
              <span class="strategy-name">F2: 去除括号后缀</span>
              <span class="strategy-desc">去除"(Deluxe Edition)"等</span>
            </div>
          </label>
          <label class="strategy-row">
            <input
              type="checkbox"
              v-model="form.F3_luceneTokenSearch"
              class="strategy-checkbox"
            />
            <div class="strategy-info">
              <span class="strategy-name">F3: 分词搜索</span>
              <span class="strategy-desc">最宽松的匹配方式</span>
            </div>
          </label>
        </div>
      </div>

      <div class="modal-footer">
        <div class="main-actions">
          <button class="cancel-btn" @click="handleCancel">取消</button>
          <button class="confirm-btn" @click="handleSave">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'

interface StrategyForm {
  Q1_fullTitleFullArtist: boolean
  Q2_fullTitleFirstArtist: boolean
  Q3_titleFirstWordFirstArtist: boolean
  F1_removeArtistPrefix: boolean
  F2_removeParenSuffix: boolean
  F3_luceneTokenSearch: boolean
}

const visible = ref(false)

const form = reactive<StrategyForm>({
  Q1_fullTitleFullArtist: true,
  Q2_fullTitleFirstArtist: true,
  Q3_titleFirstWordFirstArtist: true,
  F1_removeArtistPrefix: true,
  F2_removeParenSuffix: true,
  F3_luceneTokenSearch: true
})

let cleanupListener: (() => void) | null = null

onMounted(() => {
  cleanupListener = window.api.onMenuOpenSettings(() => {
    openSettings()
  })
})

onUnmounted(() => {
  if (cleanupListener) {
    cleanupListener()
    cleanupListener = null
  }
})

async function openSettings() {
  try {
    const result = await window.api.settingsGetEnrichStrategies()
    if (result.success && result.data) {
      Object.assign(form, result.data)
    }
  } catch (error) {
    console.error('加载策略设置失败:', error)
  }
  visible.value = true
}

function handleCancel() {
  visible.value = false
}

async function handleSave() {
  try {
    const strategies: Record<string, boolean> = { ...form }
    await window.api.settingsSetEnrichStrategies(strategies)
  } catch (error) {
    console.error('保存策略设置失败:', error)
  }
  visible.value = false
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
  width: 520px;
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

.strategy-group {
  margin-bottom: 16px;
}

.strategy-group:last-child {
  margin-bottom: 0;
}

.group-title {
  font-size: 13px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #f0f0f0;
}

.strategy-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.strategy-row:hover {
  background: #fafafa;
}

.strategy-checkbox {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: #c62f2f;
}

.strategy-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.strategy-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.strategy-desc {
  font-size: 12px;
  color: #999;
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

.confirm-btn:hover {
  background: #a82828;
}
</style>
