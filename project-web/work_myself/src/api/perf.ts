import request from './request'

export type PerfEventType = 'metric' | 'api' | 'error'

export interface PerfEventInput {
  event_type: PerfEventType
  page: string
  name: string
  value?: number
  extra?: Record<string, unknown>
  visitor_id: string
}

export interface MetricP75 {
  name: string
  p75: number | null
  count: number
}

export interface TrendPoint {
  hour: string
  name: string
  avg: number
}

export interface PageRank {
  page: string
  count: number
}

export interface PerfSummary {
  range: string
  metrics: MetricP75[]
  trend: TrendPoint[]
  pages: PageRank[]
}

export interface PerfErrorItem {
  id: number
  page: string
  name: string
  extra: Record<string, unknown> | null
  created_at: string
}

export interface PerfErrorPage {
  total: number
  list: PerfErrorItem[]
}

/** 批量上报（公开，永远 200；非法条目静默丢弃） */
export function reportPerfEvents(events: PerfEventInput[]) {
  return request.post<{ accepted: number }, { accepted: number }>('/perf/events', { events })
}

export function getPerfSummary(params: { range: '1d' | '3d' | '7d'; page?: string }) {
  return request.get<PerfSummary, PerfSummary>('/perf/summary', { params })
}

export function getPerfErrors(params: { page?: number; size?: number } = {}) {
  return request.get<PerfErrorPage, PerfErrorPage>('/perf/errors', { params })
}

/** 清空性能事件（仅 admin） */
export function clearPerfEvents() {
  return request.delete<{ deleted: number }, { deleted: number }>('/perf/events')
}
