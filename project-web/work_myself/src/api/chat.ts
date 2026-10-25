import request, { ApiError, type ApiErrorBody } from './request'
import { getToken } from '@/utils/storage'

export interface ChatSession {
  id: number
  title: string
  last_active_at: string
  created_at: string
}

export type ChatRole = 'user' | 'assistant'

export interface SourceItem {
  title?: string
  category?: string
  [key: string]: unknown
}

export interface ChatMessage {
  id: number
  role: ChatRole
  content: string
  status: 'streaming' | 'done' | 'interrupted'
  sources: SourceItem[] | null
  created_at: string
}

// ---- 会话管理（REST，设计文档 §4.2） ----

// 后端列表接口统一包装 {sessions}/{messages}，此处解包后再交给页面
export async function listSessions(): Promise<ChatSession[]> {
  const res = await request.get<{ sessions: ChatSession[] }, { sessions: ChatSession[] }>(
    '/chat/sessions',
  )
  return res.sessions
}

export function createSession() {
  return request.post<ChatSession, ChatSession>('/chat/sessions')
}

export function renameSession(id: number, title: string) {
  return request.patch<ChatSession, ChatSession>(`/chat/sessions/${id}`, { title })
}

export function deleteSession(id: number) {
  return request.delete(`/chat/sessions/${id}`)
}

export async function listMessages(sessionId: number): Promise<ChatMessage[]> {
  const res = await request.get<{ messages: ChatMessage[] }, { messages: ChatMessage[] }>(
    `/chat/sessions/${sessionId}/messages`,
  )
  return res.messages
}

// ---- 流式问答（SSE，设计文档 §4.3 / §4.4） ----

export interface StreamCallbacks {
  onToken: (chunk: string) => void
  onSources?: (sources: SourceItem[]) => void
  onDone?: (messageId: number | null) => void
}

/**
 * SSE POST 通用实现（axios 不支持流式读取，用原生 fetch）。
 * 事件序列契约：token（多次）→ sources（0 或 1 次）→ done（含 message_id）
 */
async function ssePost(
  url: string,
  content: string,
  callbacks: StreamCallbacks,
  withAuth: boolean,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withAuth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
    signal,
  })

  // 流开始前的失败返回 JSON 错误体（400 EMPTY_CONTENT / 429 RATE_LIMITED / 404）
  if (!res.ok || !res.body) {
    let body: ApiErrorBody | null = null
    try {
      body = (await res.json()) as ApiErrorBody
    } catch {
      // 错误体不是 JSON 时忽略，走默认提示
    }
    throw new ApiError(
      body?.code ?? 'HTTP_ERROR',
      body?.message ?? `请求失败（${res.status}）`,
      res.status,
    )
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  // 后端所有事件的 data 统一走 json.dumps，token 也是 JSON 字符串字面量，需解析还原
  const dispatch = (data: string): void => {
    if (currentEvent === 'token') {
      try {
        callbacks.onToken(JSON.parse(data) as string)
      } catch {
        callbacks.onToken(data)
      }
    } else if (currentEvent === 'sources') {
      try {
        callbacks.onSources?.(JSON.parse(data) as SourceItem[])
      } catch {
        // sources 解析失败不阻断主流程
      }
    } else if (currentEvent === 'done') {
      let messageId: number | null = null
      try {
        messageId = (JSON.parse(data) as { message_id: number | null }).message_id
      } catch {
        // done 无 body 时按 null 处理
      }
      callbacks.onDone?.(messageId)
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 以空行为事件边界，逐行解析 event:/data:
    let sepIndex = buffer.indexOf('\n\n')
    while (sepIndex !== -1) {
      const rawEvent = buffer.slice(0, sepIndex)
      buffer = buffer.slice(sepIndex + 2)
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) currentEvent = line.slice(6).trim()
        else if (line.startsWith('data:')) dispatch(line.slice(5).trimStart())
      }
      sepIndex = buffer.indexOf('\n\n')
    }
  }
}

/** 登录用户：会话内流式提问（带历史上下文，落库）；signal 用于前端中断生成 */
export function streamSessionMessage(
  sessionId: number,
  content: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return ssePost(`/api/chat/sessions/${sessionId}/messages`, content, callbacks, true, signal)
}

/** 访客：单轮流式问答（不落库，无上下文） */
export function streamGuestMessage(
  content: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return ssePost('/api/chat/guest/messages', content, callbacks, false, signal)
}
