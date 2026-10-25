import request from './request'

export type KanbanColumn = 'todo' | 'doing' | 'done'

export interface KanbanCard {
  id: number
  title: string
  description: string | null
  column_name: KanbanColumn
  position: number
  version: number
  updated_by: number | null
  updated_at: string
}

/**
 * 全量看板快照（公开），返回 {cards: [...]} 包装；首屏与 WS 重连恢复共用。
 * 写操作全部走 WebSocket（设计文档 §5）。
 */
export async function getKanbanSnapshot(): Promise<KanbanCard[]> {
  const res = await request.get<{ cards: KanbanCard[] }, { cards: KanbanCard[] }>('/kanban/cards')
  return res.cards
}
