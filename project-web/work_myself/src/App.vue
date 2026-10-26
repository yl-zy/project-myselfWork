<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppToast from '@/components/AppToast.vue'

const router = useRouter()
const navigating = ref(false)

// 懒加载路由切页时为顶栏渲染一条加载进度，避免 chunk 加载期界面「无反应」
router.beforeEach(() => {
  navigating.value = true
  return true
})

router.afterEach(() => {
  navigating.value = false
})

router.onError(() => {
  navigating.value = false
})
</script>

<template>
  <Transition name="route-fade">
    <div v-if="navigating" class="route-loading">
      <div class="route-loading__card">
        <span class="route-loading__spinner" />
        <span class="route-loading__text">正在加载模块…</span>
      </div>
    </div>
  </Transition>
  <router-view />
  <AppToast />
</template>

<style scoped>
.route-loading {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, rgba(7, 11, 22, 0.82), rgba(7, 11, 22, 0.96));
  backdrop-filter: blur(2px);
  pointer-events: all;
}

.route-loading__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 28px 40px;
  background: rgba(13, 21, 38, 0.7);
  border: 1px solid rgba(34, 211, 238, 0.25);
  border-radius: 10px;
  box-shadow: 0 0 30px rgba(34, 211, 238, 0.12), 0 8px 40px rgba(0, 0, 0, 0.5);
}

.route-loading__spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(34, 211, 238, 0.15);
  border-top-color: var(--accent, #22d3ee);
  border-right-color: rgba(34, 211, 238, 0.5);
  border-radius: 50%;
  animation: route-loading-spin 0.8s linear infinite;
}

.route-loading__text {
  font-size: 14px;
  letter-spacing: 0.25em;
  color: rgba(193, 211, 234, 0.85);
}

@keyframes route-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

.route-fade-enter-active,
.route-fade-leave-active {
  transition: opacity 0.18s ease;
}

.route-fade-enter-from,
.route-fade-leave-to {
  opacity: 0;
}
</style>