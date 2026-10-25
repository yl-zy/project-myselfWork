/** 浏览器本地存储统一封装：token / 登录用户 / 匿名访客标识 */

const TOKEN_KEY = 'portfolio:token'
const USER_KEY = 'portfolio:user'
const VISITOR_KEY = 'portfolio:visitor_id'

export interface StoredUser {
  username: string
  role: string
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredUser
  } catch {
    return null
  }
}

export function setStoredUser(user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

/** 清空登录态（token + 用户信息） */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/** 性能监控用的匿名访客标识：首次访问生成，持久不变 */
export function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VISITOR_KEY, id)
  }
  return id
}
