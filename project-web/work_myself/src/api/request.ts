import axios, { AxiosError } from 'axios'
import { clearAuth, getToken } from '@/utils/storage'
import { toast } from '@/utils/toast'

/** 后端统一错误体（设计文档 §4）：{ code, message } */
export interface ApiErrorBody {
  code: string
  message: string
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// 请求拦截：自动携带 JWT
request.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截：成功解包 data；失败统一转 ApiError + 轻提示，401 清登录态跳登录页
request.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<ApiErrorBody>) => {
    const status = error.response?.status ?? 0
    const body = error.response?.data
    const code = body?.code ?? 'NETWORK_ERROR'
    const message =
      body?.message ?? (status > 0 ? `请求失败（${status}）` : '网络异常，请检查连接')

    if (status === 401) {
      clearAuth()
      if (window.location.pathname !== '/login') {
        const redirect = encodeURIComponent(
          window.location.pathname + window.location.search,
        )
        window.location.href = `/login?redirect=${redirect}`
      }
    }
    toast.error(message)
    return Promise.reject(new ApiError(code, message, status))
  },
)

export default request
