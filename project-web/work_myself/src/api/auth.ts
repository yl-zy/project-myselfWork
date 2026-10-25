import request from './request'

export interface LoginResponse {
  token: string
  role: string
  username: string
}

export interface UserInfo {
  id: number
  username: string
  role: string
}

export function loginApi(username: string, password: string) {
  return request.post<LoginResponse, LoginResponse>('/auth/login', { username, password })
}

/** 恢复登录态 / 校验 token 有效性 */
export function fetchMeApi() {
  return request.get<UserInfo, UserInfo>('/auth/me')
}
