<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content about-modal">
      <div class="modal-header">
        <h3>ℹ️ 关于 AlbumShelf</h3>
        <button class="modal-close" @click="close">✕</button>
      </div>

      <div class="modal-body">
        <!-- 应用标识 -->
        <div class="about-hero">
          <div class="about-logo">📀</div>
          <div class="about-name">
            AlbumShelf
            <span v-if="version" class="about-version">v{{ version }}</span>
          </div>
          <div class="about-tagline">以专辑为单位的网易云音乐收藏管理器</div>
        </div>

        <!-- 功能简介 -->
        <div class="about-section">
          <div class="section-title">功能简介</div>
          <ul class="feature-list">
            <li>🔄 同步网易云收藏的专辑（含曲目），支持增量同步与取消收藏即删除</li>
            <li>🏷️ MusicBrainz 数据补全：风格标签、专业评分、发行日期</li>
            <li>🎲 专辑级随机播放：随机挑一张专辑，一键唤起网易云播放</li>
            <li>🔍 多风格 / 艺术家筛选、搜索、排序与风格统计</li>
            <li>🧱 唱片墙与表格双视图，我的评分、网易云热评</li>
          </ul>
        </div>

        <!-- 关于作者 -->
        <div class="about-section">
          <div class="section-title">关于作者</div>
          <p class="about-text">
            作者是一位爱听歌的游戏开发程序员，习惯以专辑为单位听歌，日常使用网易云音乐。
            苦于网易云缺少风格分类、专辑随机播放与专辑筛选能力，于是利用业余时间开发了 AlbumShelf。
          </p>
        </div>

        <!-- AI 声明 -->
        <div class="about-section">
          <div class="section-title">AI 声明</div>
          <p class="about-text">
            🤖 本项目代码 100% 由 AI 生成（Claude Opus 4.6 + DeepSeek V4 Pro）
          </p>
        </div>

        <!-- 技术栈 -->
        <div class="about-section">
          <div class="section-title">技术栈</div>
          <div class="tech-tags">
            <span v-for="tech in techStack" :key="tech" class="tech-tag">{{ tech }}</span>
          </div>
        </div>

        <!-- 已知问题 -->
        <div class="about-section">
          <div class="section-title">已知问题</div>
          <div class="note-item">
            <div class="note-head">🧭 MusicBrainz 数据补全</div>
            <p class="about-text">
              MusicBrainz 的搜索算法与收录库有限，部分专辑可能匹配不到。若专辑缺失风格标签，
              建议参考 RateYourMusic 的信息手动添加（RYM 有访问保护、无法自动抓取，因此数据源退而求其次选择了 MusicBrainz）。
            </p>
          </div>
          <div class="note-item">
            <div class="note-head">▶️ 应用内播放</div>
            <p class="about-text">
              播放基于 ncm-cli，与网易云音乐 App 相比存在较多版权缺失。若点击播放后无反应，建议移步网易云 App 播放。
            </p>
          </div>
        </div>

        <!-- 底部 -->
        <div class="about-footer">
          <span class="about-author">开发者：XQTDS</span>
          <button class="github-btn" @click="openGithub">访问 GitHub 仓库 ↗</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const GITHUB_REPO_URL = 'https://github.com/XQTDS/AlbumShelf'

const techStack = [
  'Electron',
  'Vue 3',
  'TypeScript',
  'electron-vite',
  'better-sqlite3',
  'musicbrainz-api',
  'ncm-cli'
]

const version = ref('')

// 打开时获取应用版本号
watch(
  () => props.visible,
  async (v) => {
    if (v && !version.value) {
      try {
        version.value = await window.api.appGetVersion()
      } catch (err) {
        console.error('获取应用版本失败:', err)
      }
    }
  }
)

function close() {
  emit('close')
}

function openGithub() {
  window.api.openExternal(GITHUB_REPO_URL)
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

.about-modal {
  background: #1e1e1e;
  border-radius: 12px;
  width: 480px;
  max-width: 90vw;
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
  flex-shrink: 0;
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

/* 应用标识 */
.about-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid #333;
}

.about-logo {
  font-size: 44px;
  line-height: 1;
}

.about-name {
  font-size: 22px;
  font-weight: 700;
  color: #e0e0e0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.about-version {
  font-size: 13px;
  font-weight: 400;
  color: #888;
}

.about-tagline {
  font-size: 13px;
  color: #4fc3f7;
}

/* 内容分区 */
.about-section {
  margin-bottom: 14px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.feature-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.feature-list li {
  font-size: 13px;
  color: #ccc;
  line-height: 1.5;
}

.about-text {
  margin: 0;
  font-size: 13px;
  color: #ccc;
  line-height: 1.6;
}

/* 技术栈标签 */
.tech-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tech-tag {
  display: inline-block;
  padding: 3px 10px;
  background: #2a2a2a;
  color: #4fc3f7;
  border-radius: 12px;
  font-size: 12px;
  white-space: nowrap;
}

/* 已知问题 */
.note-item {
  margin-bottom: 10px;
}

.note-item:last-child {
  margin-bottom: 0;
}

.note-head {
  font-size: 13px;
  font-weight: 600;
  color: #e0e0e0;
  margin-bottom: 2px;
}

/* 底部 */
.about-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 14px;
  margin-top: 16px;
  border-top: 1px solid #333;
}

.about-author {
  font-size: 12px;
  color: #888;
}

.github-btn {
  padding: 6px 14px;
  background: #4fc3f7;
  color: #102027;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.github-btn:hover {
  background: #81d4fa;
}
</style>
