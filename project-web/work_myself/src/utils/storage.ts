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

/** 生成匿名访客 UUID：优先 crypto.randomUUID，降级到 getRandomValues（兼容非 HTTPS 环境） */
function genVisitorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 性能监控用的匿名访客标识：首次访问生成，持久不变 */
export function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY)
  if (!id) {
    id = genVisitorId()
    localStorage.setItem(VISITOR_KEY, id)
  }
  return id
}
