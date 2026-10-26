import request from './request'

export interface FlowRecord {
  from_code: string
  to_code: string
  people: number
}

export interface FlowsResponse {
  batch_time: string | null
  records: FlowRecord[]
}

export interface FlowQuery {
  level?: 'nation' | 'province'
  /** level=province 时必传，两位省级行政区划码 */
  province?: string
  /** 增量拉取：只取该批次时间之后的数据 */
  since?: string
}

export interface RankItem {
  code: string
  name: string
  people?: number
  value?: number
}

/** 全国级聚合（§4.5） */
export interface NationSummary {
  batch_time: string | null
  level: string
  top_in?: RankItem[]
  top_out?: RankItem[]
  top_net_in?: RankItem[]
}

/** 省级视角聚合（§4.5）：按最近 window_minutes 分钟窗口统计 */
export interface ProvinceSummary {
  batch_time: string | null
  level: string
  province: { code: string; name: string }
  /** 聚合窗口分钟数（服务端口径，当前 10） */
  window_minutes?: number
  total_in: number
  total_out: number
  net: number
  in_from: RankItem[]
  out_to: RankItem[]
}

export type MigrationSummary = NationSummary | ProvinceSummary

export function getFlows(params: FlowQuery = {}) {
  return request.get<FlowsResponse, FlowsResponse>('/migration/flows', { params })
}

export function getMigrationSummary(params: { level?: string; province?: string } = {}) {
  return request.get<MigrationSummary, MigrationSummary>('/migration/summary', { params })
}
