import request from './request'

export interface FlightPoint {
  seq: number
  lng: number
  lat: number
  /** 相对高度（米） */
  altitude: number
}

export interface FlightRoute {
  id: number
  name: string
  points: FlightPoint[]
}

export interface FlightRoutesResponse {
  routes: FlightRoute[]
}

/** 预置航线 + 途经点，一次性全量返回（公开，飞行状态为前端运行时状态不落库） */
export function getFlightRoutes() {
  return request.get<FlightRoutesResponse, FlightRoutesResponse>('/flight/routes')
}
