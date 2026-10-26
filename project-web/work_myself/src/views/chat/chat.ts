import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ShallowRef } from 'vue'
import {
  createSession,
  deleteSession,
  listMessages,
  listSessions,
  renameSession,
  streamGuestMessage,
  streamSessionMessage,
  type ChatSession,
  type SourceItem,
} from '@/api/chat'
import { ApiError } from '@/api/request'
import { useUserStore } from '@/store/user'
import { toast } from '@/utils/toast'

/** 页面内消息视图模型：id 为空表示流式途中尚未落库 */
export interface UiMessage {
  key: number
  id: number | null
  role: 'user' | 'assistant'
  content: string
  status: 'thinking' | 'streaming' | 'done' | 'interrupted'
  sources: SourceItem[] | null
}

const MAX_LEN = 2000
/** 面试演示场景的常见入口问题，空状态时展示 */
const SUGGESTIONS = [
  'Vue3 的响应式原理是什么？',
  '说说 HTTP 缓存策略',
  '前端性能优化有哪些手段？',
  'Vue 和 React 的区别？',
]

const md = new MarkdownIt({ linkify: true, breaks: true })

/** Markdown → 消毒后的 HTML（回答内容为后端生成的 Markdown 文本） */
export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(md.render(text))
}

/** 会话列表时间：当天显示时分，否则显示月日 */
export function formatSessionTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay) return hm
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** textarea 随内容自适应高度（上限 160px） */
export function autoResize(e: Event): void {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

/** 知识库问答页逻辑：多会话 CRUD + SSE 流式渲染 + 访客单轮模式 */
export function useChat(messagesEl: Readonly<ShallowRef<HTMLElement | null>>) {
  const userStore = useUserStore()

  const sessions = ref<ChatSession[]>([])
  const activeSessionId = ref<number | null>(null)
  const messages = ref<UiMessage[]>([])
  const input = ref('')
  const sending = ref(false)
  const loadingSessions = ref(false)
  const loadingMessages = ref(false)
  const sidebarOpen = ref(false)

  /** 行内重命名 / 删除确认状态 */
  const editingId = ref<number | null>(null)
  const editingTitle = ref('')
  const confirmingDeleteId = ref<number | null>(null)

  let msgSeq = 0
  let abortController: AbortController | null = null
  /** 用户是否停留在底部附近（上翻阅读时不强制滚动） */
  let nearBottom = true

  // ---- 打字机：onDone 内 setTimeout 递归，零全局变量 ----

  const isGuest = computed(() => !userStore.isLoggedIn)
  const inputCount = computed(() => input.value.length)

  // ---- 滚动 ----
  function handleScroll(): void {
    const el = messagesEl.value
    if (!el) return
    nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function scrollToBottom(force = false): Promise<void> {
    if (!force && !nearBottom) return
    await nextTick()
    const el = messagesEl.value
    if (el) el.scrollTop = el.scrollHeight
  }

  // ---- 会话管理（登录模式） ----
  async function loadSessions(selectFirst = false): Promise<void> {
    loadingSessions.value = true
    try {
      sessions.value = await listSessions()
      if (selectFirst && sessions.value.length > 0 && activeSessionId.value === null) {
        await selectSession(sessions.value[0].id)
      }
    } catch {
      // 拦截器已提示
    } finally {
      loadingSessions.value = false
    }
  }

  async function selectSession(id: number): Promise<void> {
    if (sending.value) {
      toast.info('回答生成中，请先停止或等待完成')
      return
    }
    activeSessionId.value = id
    sidebarOpen.value = false
    loadingMessages.value = true
    try {
      const list = await listMessages(id)
      messages.value = list.map((m) => ({
        key: ++msgSeq,
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status,
        sources: m.sources,
      }))
      void scrollToBottom(true)
    } catch {
      // 拦截器已提示
    } finally {
      loadingMessages.value = false
    }
  }

  async function newSession(): Promise<void> {
    if (sending.value) {
      toast.info('回答生成中，请先停止或等待完成')
      return
    }
    try {
      const s = await createSession()
      sessions.value = [s, ...sessions.value]
      activeSessionId.value = s.id
      messages.value = []
      sidebarOpen.value = false
    } catch {
      // 拦截器已提示
    }
  }

  function startRename(s: ChatSession): void {
    editingId.value = s.id
    editingTitle.value = s.title
  }

  async function submitRename(): Promise<void> {
    const id = editingId.value
    const title = editingTitle.value.trim()
    editingId.value = null
    if (!id || !title) return
    try {
      const updated = await renameSession(id, title)
      const idx = sessions.value.findIndex((s) => s.id === id)
      if (idx !== -1) sessions.value[idx] = updated
      toast.success('已重命名')
    } catch {
      // 拦截器已提示
    }
  }

  function askDelete(id: number): void {
    confirmingDeleteId.value = id
    // 3 秒未确认自动恢复，避免误触残留
    window.setTimeout(() => {
      if (confirmingDeleteId.value === id) confirmingDeleteId.value = null
    }, 3000)
  }

  async function confirmDelete(id: number): Promise<void> {
    confirmingDeleteId.value = null
    try {
      await deleteSession(id)
      sessions.value = sessions.value.filter((s) => s.id !== id)
      if (activeSessionId.value === id) {
        activeSessionId.value = null
        messages.value = []
        if (sessions.value.length > 0) await selectSession(sessions.value[0].id)
      }
      toast.success('会话已删除')
    } catch {
      // 拦截器已提示
    }
  }

  // ---- 发送与流式渲染 ----
  function pushMessage(role: UiMessage['role'], status: UiMessage['status']): UiMessage {
    const msg: UiMessage = {
      key: ++msgSeq,
      id: null,
      role,
      content: '',
      status,
      sources: null,
    }
    messages.value.push(msg)
    return msg
  }

  async function send(raw?: string): Promise<void> {
    const content = (raw ?? input.value).trim()
    if (!content) return
    if (content.length > MAX_LEN) {
      toast.info(`问题最长 ${MAX_LEN} 字`)
      return
    }
    if (sending.value) {
      toast.info('上一条回答生成中，请先停止或等待完成')
      return
    }

    // 登录模式下无会话时自动建一个（首条提问后端会回填标题）
    if (userStore.isLoggedIn && activeSessionId.value === null) {
      try {
        const s = await createSession()
        sessions.value = [s, ...sessions.value]
        activeSessionId.value = s.id
      } catch {
        return
      }
    }

    input.value = ''
    sending.value = true
    pushMessage('user', 'done').content = content
    // 先显示"思考中..."，等 SSE 全部收完后再切成 streaming 启动打字机
    const assistantMsg = pushMessage('assistant', 'thinking')
    void scrollToBottom(true)

    abortController = new AbortController()
    let collected = '' // SSE 收集中的完整回答
    const callbacks = {
      onToken: (chunk: string) => {
        collected += chunk
      },
      onSources: (sources: SourceItem[]) => {
        assistantMsg.sources = sources
      },
      onDone: (messageId: number | null) => {
        console.log('[chat] onDone called, collected.length=', collected.length)
        const full = collected
        let i = 0

        // 通过 messages.value 内的 proxy 元素更新，确保 Vue 响应式稳定触发
        const getMsg = (): UiMessage => messages.value[messages.value.length - 1]

        getMsg().status = 'streaming'

        const tick = (): void => {
          const m = messages.value[messages.value.length - 1]
          console.log('[typer] tick i=', i, 'fullLen=', full.length, 'msgStatus=', m?.status)
          if (!m || m.status === 'interrupted') return // 已中断则停止
          if (i >= full.length) {
            // 打完了，标 done
            m.id = messageId
            m.status = 'done'
            void scrollToBottom()
            return
          }
          i++
          m.content = full.slice(0, i)
          void scrollToBottom()
          // 动态节奏：句末/换行多停
          let delay = 25 + Math.random() * 10
          const ch = full[i - 1]
          if (ch === '。' || ch === '！' || ch === '？' || ch === '.' || ch === '!' || ch === '?') delay = 55 + Math.random() * 30
          else if (ch === '\n') delay = 60 + Math.random() * 30
          setTimeout(tick, delay)
        }
        tick()
      },
    }

    try {
      if (userStore.isLoggedIn && activeSessionId.value !== null) {
        await streamSessionMessage(activeSessionId.value, content, callbacks, abortController.signal)
        // 标题回填 + last_active_at 变化，静默刷新列表排序
        void loadSessions()
      } else {
        await streamGuestMessage(content, callbacks, abortController.signal)
      }
      // await 在此返回意味着 SSE 已读完，但打字可能还没追平
    } catch (err) {
      // 注意：打字机是 setTimeout 递归，异常时它仍会继续 tick（因为闭包已捕获 full/i）
      // 所以这里需要让中断后的打字机"感知到中断"——用 status 判断
      // 最简单的做法：让 tick 在每次执行前检查 status，如果已 interrupted 就停
      // 但为了保持极简，这里直接让异常分支覆盖逻辑继续工作即可

      // 前端主动中断
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (assistantMsg.status === 'thinking') {
          // 思考阶段就停
          assistantMsg.content = collected
        } else if (assistantMsg.content === '' && collected !== '') {
          assistantMsg.content = collected
        }
        assistantMsg.status = 'interrupted'
      } else if (assistantMsg.status === 'thinking') {
        // 流开始前失败（限流/参数错误）：移除占位消息
        messages.value = messages.value.filter((m) => m.key !== assistantMsg.key)
      } else {
        // 打字中途断开
        if (assistantMsg.content === '' && collected !== '') {
          assistantMsg.content = collected
        }
        assistantMsg.status = 'interrupted'
        toast.error(err instanceof ApiError ? err.message : '连接中断，回答未完整')
      }
    } finally {
      sending.value = false
      abortController = null
    }
  }

  function stop(): void {
    abortController?.abort()
  }

  function useSuggestion(text: string): void {
    void send(text)
  }

  // ---- 登录态切换：访客 ↔ 登录互切时重置现场 ----
  watch(
    () => userStore.isLoggedIn,
    () => {
      abortController?.abort()
      sending.value = false
      messages.value = []
      activeSessionId.value = null
      sessions.value = []
    },
  )

  onMounted(() => {
    if (userStore.isLoggedIn) void loadSessions(true)
  })

  onBeforeUnmount(() => {
    abortController?.abort()
  })

  return {
    userStore,
    isGuest,
    sessions,
    activeSessionId,
    messages,
    input,
    inputCount,
    sending,
    loadingSessions,
    loadingMessages,
    sidebarOpen,
    editingId,
    editingTitle,
    confirmingDeleteId,
    SUGGESTIONS,
    MAX_LEN,
    renderMarkdown,
    formatSessionTime,
    autoResize,
    handleScroll,
    selectSession,
    newSession,
    startRename,
    submitRename,
    askDelete,
    confirmDelete,
    send,
    stop,
    useSuggestion,
  }
}
