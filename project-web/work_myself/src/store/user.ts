import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchMeApi, loginApi } from '@/api/auth'
import {
  clearAuth,
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
  type StoredUser,
} from '@/utils/storage'

/** 登录态：token 与用户信息持久化在 localStorage，刷新自动恢复 */
export const useUserStore = defineStore('user', () => {
  const token = ref(getToken())
  const user = ref<StoredUser | null>(getStoredUser())

  const isLoggedIn = computed(() => Boolean(token.value))
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(username: string, password: string): Promise<void> {
    const res = await loginApi(username, password)
    token.value = res.token
    user.value = { username: res.username, role: res.role }
    setToken(res.token)
    setStoredUser(user.value)
  }

  function logout(): void {
    clearAuth()
    token.value = ''
    user.value = null
  }

  /** 刷新后向服务端校验并同步用户信息（token 失效时拦截器会清登录态跳登录） */
  async function syncMe(): Promise<void> {
    if (!token.value) return
    const me = await fetchMeApi()
    user.value = { username: me.username, role: me.role }
    setStoredUser(user.value)
  }

  return { token, user, isLoggedIn, isAdmin, login, logout, syncMe }
})
