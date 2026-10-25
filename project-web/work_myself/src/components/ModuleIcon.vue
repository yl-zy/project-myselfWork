<script setup lang="ts">
// 首页模块卡片的线条风 SVG 图标（stroke 统一走 currentColor）
defineProps<{ name: string }>()
</script>

<template>
  <svg
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- 人口流动：节点 + 迁徙弧线 -->
    <template v-if="name === 'migration'">
      <circle cx="10" cy="34" r="4" />
      <circle cx="38" cy="14" r="4" />
      <circle cx="38" cy="36" r="3" opacity="0.6" />
      <path d="M14 31 C 22 18, 28 16, 34 15" />
      <path d="M13 36 C 20 40, 28 40, 35 37" opacity="0.6" />
      <path d="M30 13 l4 2 -3 3" />
    </template>

    <!-- 无人机：四旋翼俯视图 -->
    <template v-else-if="name === 'drone'">
      <rect x="20" y="20" width="8" height="8" rx="2" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="36" cy="12" r="5" />
      <circle cx="12" cy="36" r="5" />
      <circle cx="36" cy="36" r="5" />
      <path d="M16 16 l4 4 M32 16 l-4 4 M16 32 l4 -4 M32 32 l-4 -4" />
    </template>

    <!-- 问答：对话气泡 + 流线 -->
    <template v-else-if="name === 'chat'">
      <path d="M8 10 h32 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 H20 l-8 8 v-8 H8 a4 4 0 0 1 -4 -4 V14 a4 4 0 0 1 4 -4 z" />
      <path d="M14 20 h20 M14 27 h12" opacity="0.7" />
    </template>

    <!-- 看板：三列卡片 -->
    <template v-else-if="name === 'kanban'">
      <rect x="6" y="8" width="10" height="32" rx="2" />
      <rect x="19" y="8" width="10" height="32" rx="2" opacity="0.7" />
      <rect x="32" y="8" width="10" height="32" rx="2" opacity="0.45" />
      <path d="M9 15 h4 M9 21 h4 M22 15 h4 M35 15 h4" />
    </template>

    <!-- 性能监控：折线趋势 + 基线 -->
    <template v-else>
      <path d="M6 40 h36" opacity="0.5" />
      <path d="M8 34 L18 24 L26 29 L36 14 L42 18" />
      <circle cx="36" cy="14" r="2.5" fill="currentColor" stroke="none" />
      <path d="M8 12 v-2 M20 10 v-2 M32 12 v-2" opacity="0.35" />
    </template>
  </svg>
</template>
