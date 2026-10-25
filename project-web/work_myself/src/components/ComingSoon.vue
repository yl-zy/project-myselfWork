<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

// 临时占位页：模块开发完成前挂在对应路由上，开发时替换为正式页面
const route = useRoute()
const title = computed(() => (route.meta.title as string | undefined) ?? '模块')
</script>

<template>
  <div class="coming-soon">
    <p class="badge">MODULE</p>
    <h1 class="title text-gradient">{{ title }}</h1>
    <p class="tip">模块开发中，敬请期待</p>
    <router-link class="back" to="/">← 返回首页</router-link>
  </div>
</template>

<style scoped>
.coming-soon {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  text-align: center;
}

.badge {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.3em;
  color: var(--accent);
}

.title {
  font-size: clamp(28px, 5vw, 48px);
  font-weight: 700;
}

.tip {
  color: var(--text-secondary);
}

.back {
  margin-top: 8px;
  padding: 10px 24px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: all 0.25s ease;
}

.back:hover {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: var(--shadow-glow);
}
</style>
