import { reactive } from 'vue'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  message: string
}

const state = reactive({ list: [] as ToastItem[] })
let seq = 0

function push(type: ToastType, message: string, duration: number): void {
  const id = ++seq
  state.list.push({ id, type, message })
  window.setTimeout(() => {
    const idx = state.list.findIndex((t) => t.id === id)
    if (idx !== -1) state.list.splice(idx, 1)
  }, duration)
}

/** 全局轻提示：axios 拦截器与页面共用，由 AppToast.vue 渲染 */
export const toast = {
  state,
  success: (message: string) => push('success', message, 2500),
  error: (message: string) => push('error', message, 4000),
  info: (message: string) => push('info', message, 2500),
}
