<script setup lang="ts">
/**
 * 实体介质图标（黑胶/CD/磁带）
 * 图标选型记录见 openspec/changes/2026-08-19-album-physical-media/icon-candidates/README.md
 * - vinyl:    MDI `album`（Material Design Icons，Apache 2.0，单色 currentColor）
 * - cd:       Twemoji `1f4bf`（CC BY 4.0，彩色）
 * - cassette: Twemoji `1f4fc`（CC BY 4.0，彩色）
 * 尺寸由父级 font-size 控制（svg 为 1em 宽高）。
 */
defineProps<{ type: 'vinyl' | 'cd' | 'cassette' }>()
</script>

<template>
  <!-- 黑胶：MDI album -->
  <svg
    v-if="type === 'vinyl'"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
  >
    <path
      fill="currentColor"
      d="M12 11a1 1 0 0 0-1 1a1 1 0 0 0 1 1a1 1 0 0 0 1-1a1 1 0 0 0-1-1m0 5.5c-2.5 0-4.5-2-4.5-4.5s2-4.5 4.5-4.5s4.5 2 4.5 4.5s-2 4.5-4.5 4.5M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2"
    />
  </svg>
  <!-- CD：Twemoji 1f4bf -->
  <svg
    v-else-if="type === 'cd'"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 36 36"
  >
    <path
      fill="#8899a6"
      d="M36 18c0 9.941-8.059 18-18 18S0 27.941 0 18S8.059 0 18 0s18 8.059 18 18m-18-3a3 3 0 1 0 0 6a3 3 0 0 0 0-6"
    />
    <path
      fill="#ccd6dd"
      d="M13.288 17.476a4.74 4.74 0 0 1 1.343-2.846L6.686 6.686a15.95 15.95 0 0 0-4.584 9.547zm9.425 1.048a4.74 4.74 0 0 1-1.343 2.846l7.944 7.944a15.95 15.95 0 0 0 4.584-9.547z"
    />
    <path
      fill="#f5f8fa"
      d="m18.527 22.712l1.251 11.183a15.95 15.95 0 0 0 9.536-4.582l-7.944-7.944a4.75 4.75 0 0 1-2.843 1.343m-1.023-9.427L16.325 2.089a15.95 15.95 0 0 0-9.639 4.598l7.944 7.944a4.75 4.75 0 0 1 2.874-1.346"
    />
  </svg>
  <!-- 磁带：Twemoji 1f4fc -->
  <svg
    v-else
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 36 36"
  >
    <path
      fill="#31373d"
      d="M36 25s0 4-4 4H4s-4 0-4-4V10c0-4 4-4 4-4h28s4 0 4 4z"
    />
    <path
      fill="#ccd6dd"
      d="M32 12h-6s-1 0-1 1v8s0 1 1 1h6c1 0 2-2 2-5s-1-5-2-5"
    />
    <path
      d="M29.894 12H26s-1 0-1 1v1a3 3 0 0 1 0 6v1s0 1 1 1h3.895A6.97 6.97 0 0 0 32 17a6.98 6.98 0 0 0-2.106-5"
    />
    <path
      fill="#66757f"
      d="M28 17a3 3 0 0 0-3-3v6a3 3 0 0 0 3-3"
    />
    <path
      fill="#ccd6dd"
      d="M4 12h6s1 0 1 1v8s0 1-1 1H4c-1 0-2-2-2-5s1-5 2-5"
    />
    <path
      d="M11 20a3 3 0 1 1 0-6v-1c0-1-1-1-1-1H6.106C4.808 13.271 4 15.04 4 17s.808 3.729 2.106 5H10c1 0 1-1 1-1z"
    />
    <path
      fill="#66757f"
      d="M8 17a3 3 0 0 0 3 3v-6a3 3 0 0 0-3 3"
    />
    <path
      fill="#88c9f9"
      d="M13 14s0-1 1-1h8s1 0 1 1v6s0 1-1 1h-8s-1 0-1-1z"
    />
    <path
      d="M34 26a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h30a1 1 0 0 1 1 1"
    />
  </svg>
</template>
