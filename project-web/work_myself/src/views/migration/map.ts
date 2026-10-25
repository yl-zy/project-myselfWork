import OlMap from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import GeoJSON from 'ol/format/GeoJSON'
import { LineString, Point } from 'ol/geom'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style'
import 'ol/ol.css'
import type { FlowRecord } from '@/api/migration'

export interface ProvinceInfo {
  code: string
  name: string
  center: [number, number]
}

interface GeoFeature {
  properties: { adcode: number; name: string; center: [number, number] }
}

/** 单条在屏飞线：曲线 + 流动光点 + 静态终点 */
interface FlowEntry {
  curve: LineString
  lineFeature: Feature<LineString>
  dotFeature: Feature<Point>
  endFeature: Feature<Point>
  t: number
  speed: number
}

const MAX_FLOWS = 72 // 在屏飞线上限，超出按先进先出移除
const CURVE_SEGMENTS = 60

/** 二次贝塞尔采样生成迁徙弧线（控制点向垂直方向抬高，高度与距离成正比） */
function makeCurve(from: [number, number], to: [number, number]): LineString {
  const [x1, y1] = from
  const [x2, y2] = to
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.hypot(dx, dy) || 1
  const lift = Math.min(dist * 0.18, 8)
  const cx = (x1 + x2) / 2 - (dy / dist) * lift
  const cy = (y1 + y2) / 2 + (dx / dist) * lift
  const coords: [number, number][] = []
  for (let i = 0; i <= CURVE_SEGMENTS; i++) {
    const t = i / CURVE_SEGMENTS
    const a = 1 - t
    coords.push([
      a * a * x1 + 2 * a * t * cx + t * t * x2,
      a * a * y1 + 2 * a * t * cy + t * t * y2,
    ])
  }
  return new LineString(coords)
}

/**
 * 人口流动地图封装：深色底图（本地 GeoJSON）+ 迁徙飞线动画。
 * 投影直接用 EPSG:4326（GeoJSON 即经纬度），大屏固定视角禁交互。
 */
export class MigrationMap {
  private readonly map: OlMap
  private readonly flowSource = new VectorSource()
  private readonly provinces = new Map<string, ProvinceInfo>()
  private flows: FlowEntry[] = []
  private rafId = 0
  private readonly lineStyleCache = new Map<number, Style[]>()

  private readonly endStyle = new Style({
    image: new CircleStyle({ radius: 2.4, fill: new Fill({ color: 'rgba(129,140,248,0.9)' }) }),
  })

  private readonly dotStyles = [
    new Style({
      image: new CircleStyle({ radius: 6, fill: new Fill({ color: 'rgba(34,211,238,0.22)' }) }),
    }),
    new Style({
      image: new CircleStyle({ radius: 2.4, fill: new Fill({ color: '#eafcff' }) }),
    }),
  ]

  private constructor(target: HTMLElement, baseSource: VectorSource, provinces: ProvinceInfo[]) {
    provinces.forEach((p) => this.provinces.set(p.code, p))

    const baseLayer = new VectorLayer({
      source: baseSource,
      style: new Style({
        fill: new Fill({ color: 'rgba(15,30,55,0.55)' }),
        stroke: new Stroke({ color: 'rgba(34,211,238,0.35)', width: 1 }),
      }),
    })
    const flowLayer = new VectorLayer({ source: this.flowSource })

    this.map = new OlMap({
      target,
      layers: [baseLayer, flowLayer],
      controls: [],
      interactions: [],
      view: new View({ projection: 'EPSG:4326' }),
    })
    this.map.getView().fit([73, 16, 136, 54], {
      size: this.map.getSize(),
      padding: [16, 16, 16, 16],
    })
    this.animate()
  }

  /** 加载本地中国省级 GeoJSON 并建图；省份码表（两位码 → 名称/中心点）由此产出 */
  static async create(target: HTMLElement): Promise<MigrationMap> {
    const res = await fetch('/geo/china.json')
    if (!res.ok) throw new Error('地图数据加载失败')
    const json = await res.json()

    const provinces: ProvinceInfo[] = (json.features as GeoFeature[]).map((f) => ({
      code: String(f.properties.adcode).slice(0, 2),
      name: f.properties.name,
      center: f.properties.center,
    }))

    const baseSource = new VectorSource({
      features: new GeoJSON().readFeatures(json, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:4326',
      }),
    })
    return new MigrationMap(target, baseSource, provinces)
  }

  getProvince(code: string): ProvinceInfo | undefined {
    return this.provinces.get(code)
  }

  /** 追加一批迁徙记录为飞线；线宽按人数占比映射 */
  addFlows(records: FlowRecord[]): void {
    const maxPeople = Math.max(...records.map((r) => r.people), 1)
    for (const r of records) {
      const from = this.provinces.get(r.from_code)
      const to = this.provinces.get(r.to_code)
      if (!from || !to || from.code === to.code) continue

      const curve = makeCurve(from.center, to.center)
      const width = 1 + (r.people / maxPeople) * 3

      const lineFeature = new Feature(curve)
      lineFeature.setStyle(this.lineStyle(width))

      const endFeature = new Feature(new Point(to.center))
      endFeature.setStyle(this.endStyle)

      const dotFeature = new Feature(new Point(from.center))
      dotFeature.setStyle(this.dotStyles)

      this.flowSource.addFeatures([lineFeature, endFeature, dotFeature])
      this.flows.push({
        curve,
        lineFeature,
        dotFeature,
        endFeature,
        t: Math.random(),
        speed: 0.0035 + Math.random() * 0.002,
      })
    }
    // FIFO 清理，控制在屏飞线总量
    while (this.flows.length > MAX_FLOWS) {
      const old = this.flows.shift()
      if (old) {
        this.flowSource.removeFeature(old.lineFeature)
        this.flowSource.removeFeature(old.endFeature)
        this.flowSource.removeFeature(old.dotFeature)
      }
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId)
    this.map.setTarget(undefined)
  }

  private lineStyle(width: number): Style[] {
    const key = Math.round(width * 10)
    let style = this.lineStyleCache.get(key)
    if (!style) {
      style = [
        new Style({
          stroke: new Stroke({ color: 'rgba(34,211,238,0.10)', width: width + 4 }),
        }),
        new Style({
          stroke: new Stroke({ color: 'rgba(34,211,238,0.7)', width }),
        }),
      ]
      this.lineStyleCache.set(key, style)
    }
    return style
  }

  /** RAF 驱动流动光点沿曲线循环 */
  private animate = (): void => {
    for (const f of this.flows) {
      f.t += f.speed
      if (f.t >= 1) f.t = 0
      f.dotFeature.getGeometry()?.setCoordinates(f.curve.getCoordinateAt(f.t))
    }
    this.rafId = requestAnimationFrame(this.animate)
  }
}
