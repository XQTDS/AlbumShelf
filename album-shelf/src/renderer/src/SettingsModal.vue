<template>
  <div v-if="visible" class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <h3>设置</h3>
      </div>

      <div class="modal-body">
        <div class="settings-section">
          <div class="group-title">匹配策略</div>
          <p class="description">
            控制 MusicBrainz 匹配时使用的搜索策略。关闭某个策略后，补全时将跳过对应的查询。
          </p>

          <div class="strategy-group">
            <div class="sub-group-title">精确匹配策略</div>
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
            <div class="sub-group-title">模糊匹配策略</div>
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

        <div class="settings-section">
          <div class="group-title">网易云凭证</div>
          <p class="description">
            配置网易云开放平台 API 凭证，保存到 ncm-cli 本地加密配置（~/.config/ncm-cli/），供同步、搜索、热评等网易云数据功能使用。Private Key 仅掩码输入，不会在界面回显或写入日志。
          </p>

          <div
            class="credential-status"
            :class="{ configured: !credentialStatusLoading && credentialConfigured }"
          >
            <span v-if="credentialStatusLoading">正在读取配置状态…</span>
            <span v-else>
              {{
                credentialConfigured
                  ? maskedAppId
                    ? `已配置（${maskedAppId}）`
                    : '已配置'
                  : '未配置'
              }}
            </span>
          </div>

          <div class="credential-form">
            <label class="field-label" for="credential-appid">App ID</label>
            <input
              id="credential-appid"
              v-model="credentialForm.appId"
              type="text"
              class="credential-input"
              placeholder="网易云开放平台 App ID"
              autocomplete="off"
              spellcheck="false"
            />
            <label class="field-label" for="credential-private-key">Private Key</label>
            <input
              id="credential-private-key"
              v-model="credentialForm.privateKey"
              type="password"
              class="credential-input"
              placeholder="网易云开放平台 Private Key"
              autocomplete="new-password"
            />
            <button
              class="credential-save-btn"
              :disabled="savingCredentials"
              @click="handleSaveCredentials"
            >
              {{ savingCredentials ? '保存中…' : '保存凭证' }}
            </button>
            <p
              v-if="credentialMessage"
              class="credential-message"
              :class="credentialMessage.type"
            >
              {{ credentialMessage.text }}
            </p>
          </div>
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
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'

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

// ==================== 网易云 API 凭证配置 ====================

const credentialForm = reactive({
  appId: '',
  privateKey: ''
})
const credentialConfigured = ref(false)
const credentialAppId = ref<string | null>(null)
const credentialStatusLoading = ref(false)
const savingCredentials = ref(false)
const credentialMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)

/** 状态行展示的掩码 appId（仅前 8 位，避免完整标识长期回显） */
const maskedAppId = computed(() => {
  const id = credentialAppId.value
  if (!id) {
    return ''
  }
  return id.length > 8 ? `${id.slice(0, 8)}…` : id
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
  visible.value = true
  credentialMessage.value = null

  const loadStrategies = window.api
    .settingsGetEnrichStrategies()
    .then((result) => {
      if (result.success && result.data) {
        Object.assign(form, result.data)
      }
    })
    .catch((error) => {
      console.error('加载策略设置失败:', error)
    })

  await Promise.all([loadStrategies, refreshCredentialStatus()])
}

/** 读取网易云凭证配置状态（打开弹窗时刷新；失败降级为"未配置"仅展示状态） */
async function refreshCredentialStatus() {
  credentialStatusLoading.value = true
  try {
    const result = await window.api.ncmGetCredentialStatus()
    if (result.success && result.data) {
      credentialConfigured.value = result.data.configured
      credentialAppId.value = result.data.appId
    } else {
      credentialConfigured.value = false
      credentialAppId.value = null
    }
  } catch (error) {
    console.error('获取网易云凭证配置状态失败:', error)
    credentialConfigured.value = false
    credentialAppId.value = null
  } finally {
    credentialStatusLoading.value = false
  }
}

/** 保存凭证（独立于策略保存，不关闭弹窗）；错误透传主进程中文 message */
async function handleSaveCredentials() {
  if (savingCredentials.value) {
    return
  }
  if (!credentialForm.appId.trim() || !credentialForm.privateKey.trim()) {
    credentialMessage.value = { type: 'error', text: 'App ID 与 Private Key 均不能为空' }
    return
  }
  savingCredentials.value = true
  credentialMessage.value = null
  try {
    const result = await window.api.ncmConfigureCredentials({
      appId: credentialForm.appId.trim(),
      privateKey: credentialForm.privateKey
    })
    if (result.success) {
      credentialMessage.value = { type: 'success', text: '凭证保存成功' }
      // 保存成功后清空输入（私钥不留在内存/界面），并刷新状态行
      credentialForm.appId = ''
      credentialForm.privateKey = ''
      await refreshCredentialStatus()
    } else {
      credentialMessage.value = {
        type: 'error',
        text: result.error || '凭证保存失败'
      }
    }
  } catch (error) {
    console.error('保存网易云凭证失败:', error)
    credentialMessage.value = {
      type: 'error',
      text: error instanceof Error ? error.message : '凭证保存失败'
    }
  } finally {
    savingCredentials.value = false
  }
}

/** 关闭弹窗并清空凭证输入（凭据仅存内存，关闭即丢弃） */
function closeSettings() {
  visible.value = false
  credentialForm.appId = ''
  credentialForm.privateKey = ''
  credentialMessage.value = null
}

function handleCancel() {
  closeSettings()
}

async function handleSave() {
  try {
    const strategies: Record<string, boolean> = { ...form }
    await window.api.settingsSetEnrichStrategies(strategies)
  } catch (error) {
    console.error('保存策略设置失败:', error)
  }
  closeSettings()
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

.settings-section {
  margin-bottom: 24px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.sub-group-title {
  font-size: 12px;
  font-weight: 600;
  color: #999;
  margin: 12px 0 6px 0;
}

/* ==================== 网易云凭证配置 ==================== */

.credential-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  font-size: 13px;
  color: #666;
  margin-bottom: 12px;
}

.credential-status.configured {
  color: #2e7d32;
  background: #f1f8f1;
  border-color: #d7ebd7;
}

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #888;
  margin-bottom: 4px;
}

.credential-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 12px;
  outline: none;
  transition: border-color 0.2s;
}

.credential-input:focus {
  border-color: #c62f2f;
}

.credential-save-btn {
  background: #c62f2f;
  color: #fff;
  border: none;
  padding: 8px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.credential-save-btn:hover:not(:disabled) {
  background: #a82828;
}

.credential-save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.credential-message {
  margin: 10px 0 0 0;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}

.credential-message.success {
  color: #2e7d32;
}

.credential-message.error {
  color: #c62f2f;
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
