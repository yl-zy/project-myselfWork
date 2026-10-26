import {
  BillboardCollection,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  Ellipsoid,
  HeadingPitchRange,
  HorizontalOrigin,
  ImageryLayer,
  Math as CesiumMath,
  Matrix3,
  Matrix4,
  NearFarScalar,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  type Billboard,
  type Entity,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { DroneBrief, DroneRoute, DroneStatus, StationInfo } from '@/api/drone'

/** 状态配色：三维场景、图例、详情面板共用一套（与深色科技风主题一致） */
export const STATUS_COLOR: Record<DroneStatus, string> = {
  standby: '#94a3b8',
  takeoff: '#fbbf24',
  delivering: '#22d3ee',
  landing: '#f472b6',
  returning: '#818cf8',
  charging: '#34d399',
}

const STATUS_COLOR_OBJ: Record<DroneStatus, Color> = {
  standby: Color.fromCssColorString(STATUS_COLOR.standby),
  takeoff: Color.fromCssColorString(STATUS_COLOR.takeoff),
  delivering: Color.fromCssColorString(STATUS_COLOR.delivering),
  landing: Color.fromCssColorString(STATUS_COLOR.landing),
  returning: Color.fromCssColorString(STATUS_COLOR.returning),
  charging: Color.fromCssColorString(STATUS_COLOR.charging),
}

/** 被筛选压暗时的颜色（保留形状、去掉亮度） */
const STATUS_COLOR_DIM: Record<DroneStatus, Color> = {
  standby: STATUS_COLOR_OBJ.standby.withAlpha(0.16),
  takeoff: STATUS_COLOR_OBJ.takeoff.withAlpha(0.16),
  delivering: STATUS_COLOR_OBJ.delivering.withAlpha(0.16),
  landing: STATUS_COLOR_OBJ.landing.withAlpha(0.16),
  returning: STATUS_COLOR_OBJ.returning.withAlpha(0.16),
  charging: STATUS_COLOR_OBJ.charging.withAlpha(0.16),
}

const DRONE_SCALE = 0.62
const DRONE_SCALE_SELECTED = 1.15
const DRONE_SCALE_HOVER = 0.95
const DRONE_SCALE_DIM = 0.3
/** 外推上限：快照长时间未到时停止外推，避免断连时无人机直线飘出视野 */
const EXTRA_CLAMP_MS = 3000
const HOVER_PICK_INTERVAL = 70

export interface FleetSceneCallbacks {
  /** 点选某架无人机 */
  onSelect: (id: string) => void
  /** 鼠标悬浮：id 为 null 表示移出；x/y 为画布内坐标（用于浮动提示定位） */
  onHover: (id: string | null, x: number, y: number) => void
}

interface DroneItem {
  id: string
  status: DroneStatus
  billboard: Billboard
  /** 本拍目标位置（ECEF），外推的起点 */
  to: Cartesian3
  /** 上次快照到达时刻，用于速度外推计时 */
  lastSnapAt: number
  /** 由 speed+heading 构造的瞬时速度（ECEF/ms），静止时为 null */
  velocity: Cartesian3 | null
  /** 当前航向（度，顺时针自正北） */
  headingTo: number
  /** 每帧复用的位置对象，避免 GC 抖动 */
  scratch: Cartesian3
}

/**
 * 物流机队三维场景封装：
 * 高德影像底图调暗出科技风 + BillboardCollection 渲染 200 架无人机（按状态着色、按航向旋转）
 * + 快照间线性插值实现连续飞行 + 点选后绘制往返航线并跟进单机模型。
 * 类比前端：相当于一个 Three.js 渲染器 + 共享状态，页面只负责往里灌快照数据。
 */
export class FleetScene {
  private readonly viewer: Viewer
  private readonly cb: FleetSceneCallbacks
  private readonly billboards: BillboardCollection
  private readonly handler: ScreenSpaceEventHandler
  private readonly glyph: HTMLCanvasElement

  private readonly items = new Map<string, DroneItem>()
  private readonly stations = new Map<string, Entity>()
  private baseEntity: Entity | null = null
  private routeEntities: Entity[] = []

  private selectedId: string | null = null
  private hoveredId: string | null = null
  private filter: DroneStatus | null = null
  /** 跟随视角：相机每帧 lookAt 选中机的 Billboard 位置（而非 trackEntity，避免模型锚点偏移） */
  private following = false
  /** 跟随视角的相机偏移（setFollow 时固定，跟全程） */
  private followOffset: HeadingPitchRange | null = null

  private rafId = 0
  private lastPick = 0
  /** 外推时复用的临时向量，避免每帧分配对象 */
  private readonly extrapolateScratch = new Cartesian3()
  /** ENU→ECEF 的变换矩阵与东/北轴 scratch，用于把 speed+heading 构造成 ECEF 速度向量 */
  private readonly transformScratch = new Matrix4()
  private readonly matrix3Scratch = new Matrix3()
  private readonly eastAxis = new Cartesian3()
  private readonly northAxis = new Cartesian3()

  private constructor(target: HTMLElement, callbacks: FleetSceneCallbacks) {
    this.cb = callbacks
    this.glyph = createDroneGlyph()

    // 高德影像瓦片（免 token、国内可达），调暗调灰出暗黑科技感
    const gaode = new UrlTemplateImageryProvider({
      url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      subdomains: ['1', '2', '3', '4'],
      maximumLevel: 18,
    })
    const imagery = new ImageryLayer(gaode, { brightness: 0.4, saturation: 0.5, contrast: 1.1 })

    this.viewer = new Viewer(target, {
      baseLayer: imagery,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
      // 开发环境保留绘图缓冲供自动化截图使用，生产环境关闭以减少 GPU 开销。
      contextOptions: { webgl: { preserveDrawingBuffer: import.meta.env.DEV } },
    })
    // 未使用 ion 服务，默认 credit 会从 cesium.com 拉 logo（国内加载失败显示裂图），隐藏
    const credit = this.viewer.cesiumWidget.creditContainer as HTMLElement
    credit.style.display = 'none'
    if (this.viewer.scene.skyBox) this.viewer.scene.skyBox.show = false
    if (this.viewer.scene.skyAtmosphere) this.viewer.scene.skyAtmosphere.show = false
    if (this.viewer.scene.sun) this.viewer.scene.sun.show = false
    if (this.viewer.scene.moon) this.viewer.scene.moon.show = false
    this.viewer.scene.backgroundColor = Color.fromCssColorString('#070b16')

    this.billboards = this.viewer.scene.primitives.add(new BillboardCollection())
    this.handler = new ScreenSpaceEventHandler(this.viewer.scene.canvas)
    this.bindPointer()

    // 初始视角：从默认北美洲平滑飞到南京基站上空（后端 BASE_LNG=118.796 BASE_LAT=32.06），
    // 不等第一波快照；第一波 applySnapshot 后再由 overview() 平滑切换到机队包围球
    const center = Cartesian3.fromDegrees(118.796, 32.06, 0)
    this.viewer.camera.flyToBoundingSphere(new BoundingSphere(center, 22000), {
      duration: 2.2,
      offset: new HeadingPitchRange(0, CesiumMath.toRadians(-52), 22000 * 1.4),
    })
  }

  static create(target: HTMLElement, callbacks: FleetSceneCallbacks): FleetScene {
    return new FleetScene(target, callbacks)
  }

  // ---- 数据灌入 ----

  /** 全队快照：增量补齐 billboard，记录插值起止点；新快照到达即从当前位置继续平滑移动 */
  setFleet(drones: DroneBrief[]): void {
    const now = performance.now()
    const seen = new Set<string>()

    for (const d of drones) {
      seen.add(d.id)
      const target = Cartesian3.fromDegrees(d.lng, d.lat, Math.max(d.alt, 2))
      let item = this.items.get(d.id)
      if (!item) {
        const billboard = this.billboards.add({
          image: this.glyph,
          position: Cartesian3.clone(target),
          scale: DRONE_SCALE,
          color: STATUS_COLOR_OBJ[d.status],
          rotation: -CesiumMath.toRadians(d.heading),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1500, 1.8, 70000, 0.7),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        })
        billboard.id = { droneId: d.id }
        item = {
          id: d.id,
          status: d.status,
          billboard,
          to: target,
          lastSnapAt: now,
          velocity: null,
          headingTo: d.heading,
          scratch: Cartesian3.clone(target),
        }
        this.items.set(d.id, item)
      } else {
        // 用后端 speed+heading 直接构造瞬时速度（零滞后），拐弯时方向准确、外推不偏离
        item.velocity = this.buildVelocity(target, d, item.velocity)
        item.to = target
        item.lastSnapAt = now
        item.headingTo = d.heading
        item.status = d.status
        item.billboard.rotation = -CesiumMath.toRadians(d.heading)
        if (!item.velocity) {
          Cartesian3.clone(target, item.scratch)
          item.billboard.position = item.scratch
        }
      }
    }

    for (const [id, item] of this.items) {
      if (seen.has(id)) continue
      this.billboards.remove(item.billboard)
      this.items.delete(id)
    }

    this.refreshLook()
    this.scheduleLoop()
  }

  /**
   * 由后端 speed(m/s) + heading(顺时针自北) 构造 ECEF 速度向量（m/ms），零滞后；
   * 静止（speed<0.5）返回 null。用本地 ENU 框架把标量速度转到地心坐标系。
   */
  private buildVelocity(target: Cartesian3, d: DroneBrief, result: Cartesian3 | null): Cartesian3 | null {
    if (d.speed < 0.5) return null
    const speedMs = d.speed / 1000
    const headingRad = CesiumMath.toRadians(d.heading)
    const east = Math.sin(headingRad) * speedMs
    const north = Math.cos(headingRad) * speedMs
    const enu = Transforms.eastNorthUpToFixedFrame(target, Ellipsoid.WGS84, this.transformScratch)
    const basis = Matrix4.getMatrix3(enu, this.matrix3Scratch)
    Matrix3.getColumn(basis, 0, this.eastAxis)
    Matrix3.getColumn(basis, 1, this.northAxis)
    Cartesian3.multiplyByScalar(this.eastAxis, east, this.eastAxis)
    Cartesian3.multiplyByScalar(this.northAxis, north, this.northAxis)
    const velocity = result ?? new Cartesian3()
    Cartesian3.add(this.eastAxis, this.northAxis, velocity)
    return velocity
  }

  /** 基站标记（只建一次） */
  setBase(base: { lng: number; lat: number; name: string }): void {
    if (this.baseEntity) return
    this.baseEntity = this.viewer.entities.add({
      position: Cartesian3.fromDegrees(base.lng, base.lat, 0),
      point: {
        pixelSize: 14,
        color: Color.fromCssColorString('#22d3ee'),
        outlineColor: Color.fromCssColorString('#22d3ee').withAlpha(0.25),
        outlineWidth: 10,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: base.name,
        font: '13px "JetBrains Mono", monospace',
        fillColor: Color.fromCssColorString('#c9d6ea'),
        showBackground: true,
        backgroundColor: Color.fromCssColorString('rgba(7,11,22,0.7)'),
        backgroundPadding: new Cartesian2(10, 6),
        pixelOffset: new Cartesian2(0, -26),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  }

  /** 配送站标记：从顶层 stations 字典增量补齐，避免重复建实体 */
  setStations(stations: Record<string, StationInfo>): void {
    for (const [code, s] of Object.entries(stations)) {
      if (this.stations.has(code)) continue
      const entity = this.viewer.entities.add({
        position: Cartesian3.fromDegrees(s.lng, s.lat, 0),
        point: {
          pixelSize: 6,
          color: Color.fromCssColorString('#818cf8').withAlpha(0.55),
          outlineColor: Color.fromCssColorString('#818cf8').withAlpha(0.2),
          outlineWidth: 4,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      this.stations.set(code, entity)
    }
  }

  // ---- 交互 ----

  /** 筛选态：只高亮目标状态，其余压暗 */
  setFilter(status: DroneStatus | null): void {
    this.filter = status
    this.refreshLook()
  }

  /** 选中单机：相机飞向该机，等下一条详情返回后由 updateRoute 画航线 */
  selectDrone(id: string): void {
    this.selectedId = id
    this.viewer.trackedEntity = undefined
    this.following = false
    this.followOffset = null
    this.clearRoute()
    this.refreshLook()

    const item = this.items.get(id)
    if (!item) return
    this.viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.clone(item.to), 80), {
      duration: 2.0,
      offset: new HeadingPitchRange(CesiumMath.toRadians(15), CesiumMath.toRadians(-32), 900),
    })
  }

  /** 选中机型的往返路线：基站 → 配送站 → 基站（虚线）+ 目的站高亮 */
  updateRoute(route: DroneRoute | null): void {
    this.clearRoute()
    if (!route || !this.selectedId) return
    const cruise = 110
    const base = Cartesian3.fromDegrees(route.base.lng, route.base.lat, cruise)
    const station = Cartesian3.fromDegrees(route.station.lng, route.station.lat, cruise)
    this.routeEntities.push(
      this.viewer.entities.add({
        polyline: {
          positions: [base, station, base],
          width: 2,
          material: new PolylineDashMaterialProperty({
            color: Color.fromCssColorString('#22d3ee').withAlpha(0.8),
            dashLength: 14,
          }),
        },
      }),
      this.viewer.entities.add({
        position: station,
        point: {
          pixelSize: 11,
          color: Color.fromCssColorString('#f472b6'),
          outlineColor: Color.fromCssColorString('#f472b6').withAlpha(0.3),
          outlineWidth: 8,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${route.station.code} ${route.station.name}`,
          font: '12px "JetBrains Mono", monospace',
          fillColor: Color.fromCssColorString('#f9a8d4'),
          showBackground: true,
          backgroundColor: Color.fromCssColorString('rgba(7,11,22,0.7)'),
          backgroundPadding: new Cartesian2(8, 5),
          pixelOffset: new Cartesian2(0, -24),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    )
  }

  /** 跟随机头视角：相机跟随选中机 Billboard 的实时插值位置（无模型锚点误差） */
  setFollow(enabled: boolean): void {
    this.viewer.trackedEntity = undefined
    if (enabled && this.selectedId) {
      // 从当前相机位置推算一个合适的俯视偏移，记住后跟全程
      const item = this.items.get(this.selectedId)
      const center = item ? Cartesian3.clone(item.scratch) : this.viewer.camera.position
      const range = Cartesian3.distance(this.viewer.camera.position, center) || 1200
      this.followOffset = new HeadingPitchRange(
        this.viewer.camera.heading,
        Math.max(CesiumMath.toRadians(-70), this.viewer.camera.pitch),
        range,
      )
      this.following = true
    } else {
      this.following = false
      this.followOffset = null
    }
    this.scheduleLoop()
  }

  /** 取消选中：清路线、切回机队总览 */
  clearSelection(): void {
    this.selectedId = null
    this.following = false
    this.followOffset = null
    this.viewer.trackedEntity = undefined
    this.clearRoute()
    this.refreshLook()
    // 取消选中 = 回到总览视角（用户明确要求）
    this.overview()
  }

  /** 机队总览：按当前机群包围球拉远俯瞰 */
  overview(): void {
    this.viewer.trackedEntity = undefined
    const points = [...this.items.values()].map((i) => i.to)
    if (points.length === 0) return
    const sphere = BoundingSphere.fromPoints(points)
    this.viewer.camera.flyToBoundingSphere(sphere, {
      duration: 2,
      offset: new HeadingPitchRange(0, CesiumMath.toRadians(-52), sphere.radius * 2.4),
    })
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId)
    this.handler.destroy()
    this.viewer.destroy()
  }

  // ---- 内部 ----

  private bindPointer(): void {
    this.handler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
      const id = this.pickDroneId(movement.position)
      if (id) this.cb.onSelect(id)
    }, ScreenSpaceEventType.LEFT_CLICK)

    this.handler.setInputAction((movement: ScreenSpaceEventHandler.MotionEvent) => {
      const now = performance.now()
      if (now - this.lastPick < HOVER_PICK_INTERVAL) return
      this.lastPick = now
      const id = this.pickDroneId(movement.endPosition)
      const canvas = this.viewer.scene.canvas
      canvas.style.cursor = id ? 'pointer' : ''
      if (id === this.hoveredId) {
        if (id) this.cb.onHover(id, movement.endPosition.x, movement.endPosition.y)
        return
      }
      this.hoveredId = id
      this.refreshLook()
      this.cb.onHover(id, movement.endPosition.x, movement.endPosition.y)
    }, ScreenSpaceEventType.MOUSE_MOVE)
  }

  /** 屏幕坐标拾取无人机 billboard（其余实体忽略） */
  private pickDroneId(position: Cartesian2): string | null {
    const picked = this.viewer.scene.pick(position) as { id?: { droneId?: string } } | undefined
    return picked?.id?.droneId ?? null
  }

  /** 统一刷新配色与大小：选中 > 悬浮 > 筛选压暗 > 常态 */
  private refreshLook(): void {
    for (const item of this.items.values()) {
      const dimmed = this.filter !== null && item.status !== this.filter
      const selected = item.id === this.selectedId
      const hovered = item.id === this.hoveredId
      item.billboard.scale = selected
        ? DRONE_SCALE_SELECTED
        : hovered
          ? DRONE_SCALE_HOVER
          : dimmed
            ? DRONE_SCALE_DIM
            : DRONE_SCALE
      item.billboard.color = dimmed ? STATUS_COLOR_DIM[item.status] : STATUS_COLOR_OBJ[item.status]
    }
    this.viewer.scene.requestRender()
  }

  private clearRoute(): void {
    this.routeEntities.forEach((e) => this.viewer.entities.remove(e))
    this.routeEntities = []
  }

  private scheduleLoop(): void {
    if (this.rafId !== 0) return
    this.rafId = requestAnimationFrame(this.loop)
  }

  /** 每帧：纯匀速外推——每帧位置 = 快照点 + 速度×经过时间，无修正拖拽，速度恒定 */
  private loop = (): void => {
    this.rafId = 0
    const now = performance.now()
    let hasMovingDrone = false
    for (const item of this.items.values()) {
      const sinceSnap = now - item.lastSnapAt
      if (item.velocity) {
        if (sinceSnap < EXTRA_CLAMP_MS) {
          // 纯匀速外推：从最新快照点按速度直线前进，不再做修正 lerp（修正会造成"拖拽→加速"的卡顿感）
          Cartesian3.multiplyByScalar(item.velocity, sinceSnap, this.extrapolateScratch)
          Cartesian3.add(item.to, this.extrapolateScratch, item.scratch)
          item.billboard.position = item.scratch
          hasMovingDrone = true
        } else {
          // 快照中断超时后停在最后位置，不继续外推。
          Cartesian3.clone(item.to, item.scratch)
          item.billboard.position = item.scratch
          item.velocity = null
        }
      }
    }

    if (this.following && this.selectedId && this.followOffset) {
      const item = this.items.get(this.selectedId)
      if (item) {
        // 每帧 lookAt：相机聚焦 Billboard 的实时插值位置，无模型锚点误差
        this.viewer.camera.lookAt(item.scratch, this.followOffset)
      }
    }

    if (hasMovingDrone || (this.following && this.selectedId)) {
      this.viewer.scene.requestRender()
    }
    if (hasMovingDrone) this.scheduleLoop()
  }
}

/**
 * 生成无人机图标（白色，最终由 billboard.color 按状态染色）：
 * 中心发光 + 指向正北的机头三角 + 四旋翼臂。
 * 用 canvas 现场绘制而非外链图片，部署不依赖额外静态资源。
 */
function createDroneGlyph(): HTMLCanvasElement {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.translate(size / 2, size / 2)

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 30)
  glow.addColorStop(0, 'rgba(255,255,255,0.95)')
  glow.addColorStop(0.45, 'rgba(255,255,255,0.32)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(0, 0, 30, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.beginPath()
  ctx.moveTo(0, -19)
  ctx.lineTo(7, -6)
  ctx.lineTo(-7, -6)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(-11, 9)
  ctx.lineTo(11, -9)
  ctx.moveTo(11, 9)
  ctx.lineTo(-11, -9)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  for (const [x, y] of [
    [-12, -11],
    [12, -11],
    [-12, 11],
    [12, 11],
  ]) {
    ctx.beginPath()
    ctx.arc(x!, y!, 3.6, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas
}
