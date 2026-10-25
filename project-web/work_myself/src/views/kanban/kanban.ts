import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  getKanbanSnapshot,
  type KanbanCard,
  type KanbanColumn,
} from '@/api/kanban'
import { useUserStore } from '@/store/user'
import { getToken } from '@/utils/storage'
import { toast } from '@/utils/toast'

export interface OnlineMember {
  name: string
  role: string
}

/** 拖拽状态 */
interface DragState {
  cardId: number
  fromColumn: KanbanColumn
}

/** 乐观锁冲突：编辑被拒时弹出确认，附带服务端最新卡片 */
export interface ConflictState {
  cardId: number
  baseVersion: number
  localTitle: string
  localDesc: string
  serverCard: KanbanCard
}

const COLUMNS: KanbanColumn[] = ['todo', 'doing', 'done']
const COLUMN_LABEL: Record<KanbanColumn, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
}
const COLUMN_COLOR: Record<KanbanColumn, string> = {
  todo: '#fbbf24',
  doing: '#22d3ee',
  done: '#34d399',
}

/** 看板逻辑：WS 实时同步 + 拖拽排序 + 乐观锁冲突处理 + 访客只读 */
export function useKanban() {
  const userStore = useUserStore()
  const router = useRouter()

  const cards = ref<KanbanCard[]>([])
  const online = ref<OnlineMember[]>([])
  const connected = ref(false)
  const loading = ref(true)

  /** 编辑弹窗：新建或编辑已有卡片 */
  const editing = ref<{ mode: 'create' | 'edit'; column: KanbanColumn; card: KanbanCard | null; title: string; description: string } | null>(null)
  const conflict = ref<ConflictState | null>(null)

  const drag = ref<DragState | null>(null)

  const canWrite = computed(() => userStore.isLoggedIn)

  let ws: WebSocket | null = null
  let reconnectTimer = 0
  let heartbeatTimer = 0
  let reconnectDelay = 1000
  let manualClose = false

  // ---- 按列分组 ----
  const grouped = computed(() => {
    const map: Record<KanbanColumn, KanbanCard[]> = { todo: [], doing: [], done: [] }
    for (const c of [...cards.value].sort((a, b) => a.position - b.position)) {
      map[c.column_name].push(c)
    }
    return map
  })

  const columnCount = (col: KanbanColumn) => grouped.value[col].length

  // ---- WebSocket ----
  function wsUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getToken()
    const q = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${proto}//${location.host}/ws/kanban${q}`
  }

  function connect(): void {
    manualClose = false
    try {
      ws = new WebSocket(wsUrl())
    } catch {
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      connected.value = true
      reconnectDelay = 1000
      // 心跳：30s 一次
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = window.setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      }, 30000)
    }

    ws.onmessage = (ev) => {
      try {
        handleMessage(JSON.parse(ev.data))
      } catch {
        // 忽略非 JSON 消息
      }
    }

    ws.onclose = () => {
      connected.value = false
      window.clearInterval(heartbeatTimer)
      if (!manualClose) scheduleReconnect()
    }

    ws.onerror = () => {
      // onclose 会跟进处理重连
    }
  }

  function scheduleReconnect(): void {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 16000)
      connect()
    }, reconnectDelay)
  }

  function disconnect(): void {
    manualClose = true
    window.clearInterval(heartbeatTimer)
    window.clearTimeout(reconnectTimer)
    ws?.close()
    ws = null
  }

  function send(type: string, payload: Record<string, unknown>): void {
    if (!canWrite.value) {
      toast.info('请登录后操作看板')
      router.push(`/login?redirect=${encodeURIComponent('/kanban')}`)
      return
    }
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }))
    } else {
      toast.error('连接未就绪，请稍后重试')
    }
  }

  // ---- 消息分发 ----
  function handleMessage(msg: { type: string; payload: any; sender: string }): void {
    switch (msg.type) {
      case 'board.snapshot':
        cards.value = (msg.payload?.cards ?? []) as KanbanCard[]
        loading.value = false
        break
      case 'presence.update':
        online.value = (msg.payload?.online ?? []) as OnlineMember[]
        break
      case 'card.created': {
        const c = msg.payload as KanbanCard
        if (!cards.value.find((x) => x.id === c.id)) cards.value.push(c)
        break
      }
      case 'card.moved':
      case 'card.updated': {
        const c = msg.payload as KanbanCard
        const idx = cards.value.findIndex((x) => x.id === c.id)
        if (idx !== -1) cards.value[idx] = c
        break
      }
      case 'card.deleted':
        cards.value = cards.value.filter((x) => x.id !== msg.payload.id)
        break
      case 'op.rejected': {
        const reason = msg.payload?.reason as string
        if (reason === 'VERSION_CONFLICT' && msg.payload.card) {
          // 编辑冲突：弹出冲突确认，附带服务端最新卡片
          if (editing.value?.card) {
            conflict.value = {
              cardId: editing.value.card.id,
              baseVersion: msg.payload.card.version,
              localTitle: editing.value.title,
              localDesc: editing.value.description,
              serverCard: msg.payload.card as KanbanCard,
            }
          } else {
            toast.info('该卡片刚被他人修改，已同步最新内容')
            const c = msg.payload.card as KanbanCard
            const idx = cards.value.findIndex((x) => x.id === c.id)
            if (idx !== -1) cards.value[idx] = c
          }
        } else if (reason === 'UNAUTHORIZED') {
          toast.info('请登录后操作看板')
        } else {
          toast.error(`操作失败：${reason}`)
        }
        break
      }
      case 'pong':
        break
    }
  }

  // ---- CRUD ----
  function openCreate(column: KanbanColumn): void {
    editing.value = { mode: 'create', column, card: null, title: '', description: '' }
  }

  function openEdit(card: KanbanCard): void {
    editing.value = {
      mode: 'edit',
      column: card.column_name,
      card,
      title: card.title,
      description: card.description ?? '',
    }
  }

  function closeEditing(): void {
    editing.value = null
    conflict.value = null
  }

  function submitEditing(): void {
    if (!editing.value) return
    const title = editing.value.title.trim()
    if (!title) {
      toast.info('请输入卡片标题')
      return
    }
    if (title.length > 50) {
      toast.info('标题最长 50 字')
      return
    }
    const description = editing.value.description.trim() || null
    if (editing.value.mode === 'create') {
      send('card.create', { title, column: editing.value.column, description })
    } else if (editing.value.card) {
      send('card.update', {
        card_id: editing.value.card.id,
        title,
        description,
        base_version: editing.value.card.version,
      })
    }
    closeEditing()
  }

  /** 冲突确认后用服务端最新版本号强制覆盖 */
  function overwriteWithConflict(): void {
    if (!conflict.value) return
    send('card.update', {
      card_id: conflict.value.cardId,
      title: conflict.value.localTitle.trim(),
      description: conflict.value.localDesc.trim() || null,
      base_version: conflict.value.baseVersion,
    })
    closeEditing()
    toast.success('已覆盖最新版本')
  }

  function deleteCard(card: KanbanCard): void {
    if (!confirm(`确定删除卡片「${card.title}」？`)) return
    send('card.delete', { card_id: card.id })
  }

  // ---- 拖拽 ----
  function onDragStart(card: KanbanCard): void {
    if (!canWrite.value) return
    drag.value = { cardId: card.id, fromColumn: card.column_name }
  }

  function onDragEnd(): void {
    drag.value = null
  }

  /**
   * 计算插入位置：根据鼠标 Y 与目标列卡片中心比较，用相邻两卡片 position 的中值作为新 position。
   * 列首 / 列尾用 ±1000 留间距，便于后续继续插入。
   */
  function calcDropPosition(
    colCards: KanbanCard[],
    targetEl: HTMLElement,
    clientY: number,
  ): number {
    const children = Array.from(targetEl.querySelectorAll<HTMLElement>('[data-card-id]'))
    let insertIndex = children.length
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) {
        insertIndex = i
        break
      }
    }
    const sorted = [...colCards].sort((a, b) => a.position - b.position)
    const prev = insertIndex > 0 ? sorted[insertIndex - 1]?.position : undefined
    const next = insertIndex < sorted.length ? sorted[insertIndex]?.position : undefined
    if (prev === undefined && next === undefined) return 1000
    if (prev === undefined) return (next as number) - 1000
    if (next === undefined) return prev + 1000
    return (prev + next) / 2
  }

  function onDrop(column: KanbanColumn, targetEl: HTMLElement, e: DragEvent): void {
    e.preventDefault()
    if (!drag.value || !canWrite.value) return
    const colCards = cards.value.filter((c) => c.column_name === column)
    const position = calcDropPosition(colCards, targetEl, e.clientY)
    send('card.move', { card_id: drag.value.cardId, column, position })
    drag.value = null
  }

  function onDragOver(e: DragEvent): void {
    if (drag.value && canWrite.value) e.preventDefault()
  }

  // ---- 初始化与销毁 ----
  onMounted(() => {
    // 先拉一次快照作为兜底（WS 首屏也会下发），避免连接慢时空白
    getKanbanSnapshot()
      .then((list) => {
        cards.value = list
        loading.value = false
      })
      .catch(() => {
        loading.value = false
      })
    connect()
  })

  onBeforeUnmount(() => {
    disconnect()
  })

  return {
    COLUMNS,
    COLUMN_LABEL,
    COLUMN_COLOR,
    cards,
    grouped,
    online,
    connected,
    loading,
    editing,
    conflict,
    canWrite,
    columnCount,
    openCreate,
    openEdit,
    closeEditing,
    submitEditing,
    overwriteWithConflict,
    deleteCard,
    onDragStart,
    onDragEnd,
    onDrop,
    onDragOver,
  }
}
