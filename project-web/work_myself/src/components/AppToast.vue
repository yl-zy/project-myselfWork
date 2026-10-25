<script setup lang="ts">
import { toast } from '@/utils/toast'
</script>

<template>
  <transition-group name="toast" tag="div" class="toast-container">
    <div
      v-for="item in toast.state.list"
      :key="item.id"
      class="toast-item"
      :class="`toast-${item.type}`"
    >
      <span class="toast-dot" />
      <span class="toast-text">{{ item.message }}</span>
    </div>
  </transition-group>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(420px, calc(100vw - 48px));
  padding: 12px 18px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(12px);
  font-size: 14px;
  color: var(--text-primary);
}

.toast-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.toast-success .toast-dot {
  background: var(--accent-success);
  box-shadow: 0 0 8px var(--accent-success);
}

.toast-error .toast-dot {
  background: var(--accent-danger);
  box-shadow: 0 0 8px var(--accent-danger);
}

.toast-info .toast-dot {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(24px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
