import request from './request'

/** 无人机状态机六态（后端 §3.5 物流机队模拟） */
export type DroneStatus = 'standby' | 'takeoff' | 'delivering' | 'landing' | 'returning' | 'charging'

export interface DroneStation {
  code: string
  name: string
  lng: number
  lat: number
}

/** 快照顶层 stations 字典的值：配送站名称与坐标（坐标已由后端截断为高精度，code 作为字典键） */
export interface StationInfo {
  name: string
  lng: number
  lat: number
}

/** 快照中的单机摘要：前端 2s 轮询一次（配送站只带 code，名称/坐标由顶层 stations 反查） */
export interface DroneBrief {
  id: string
  lng: number
  lat: number
  alt: number
  heading: number
  speed: number
  battery: number
  status: DroneStatus
  order_id: string | null
  station_code: string | null
  progress: number
  flight_time: number
  completed_orders: number
}

export interface DroneStats {
  total: number
  by_status: Partial<Record<DroneStatus, number>>
  avg_battery: number
  completed_orders: number
  active_orders: number
  base: { lng: number; lat: number; name: string }
}

export interface DroneSnapshot {
  drones: DroneBrief[]
  stations: Record<string, StationInfo>
  stats: DroneStats
  ts: number
}

/** 当前任务往返路线（详情接口返回，供三维场景绘制） */
export interface DroneRoute {
  base: { lng: number; lat: number }
  station: DroneStation
  /** 往返总里程（米） */
  trip_total: number
}

/** 单机详情：摘要 + 固定档案 + 当前任务路线 */
export interface DroneDetail extends DroneBrief {
  sn: string
  model: string
  cruise_speed: number
  cruise_alt: number
  route: DroneRoute | null
}

/** 全队快照（公开）：2s 轮询，失败静默由页面展示连接状态 */
export function getDroneSnapshot() {
  return request.get<DroneSnapshot, DroneSnapshot>('/drones/snapshot', { silent: true })
}

/** 单机详情（公开）：点选某架无人机时拉取 */
export function getDroneDetail(droneId: string) {
  return request.get<DroneDetail, DroneDetail>(`/drones/${encodeURIComponent(droneId)}`, {
    silent: true,
  })
}
