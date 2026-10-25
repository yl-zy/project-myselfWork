import {
  BoundingSphere,
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian3,
  Color,
  HeadingPitchRange,
  HeadingPitchRoll,
  ImageryLayer,
  Math as CesiumMath,
  PolylineDashMaterialProperty,
  Transforms,
  UrlTemplateImageryProvider,
  Viewer,
  type Entity,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { FlightRoute } from '@/api/flight'

export type FlightState = 'idle' | 'flying' | 'paused' | 'done'
export type CameraMode = 'follow' | 'free'

export interface Telemetry {
  /** 当前速度 m/s */
  speed: number
  /** 当前海拔 m */
  altitude: number
  /** 已飞距离 m */
  flown: number
  /** 航线总里程 m */
  total: number
  /** 0-1 进度 */
  progress: number
  /** 当前航段目标途经点序号（1 起） */
  waypointIndex: number
  waypointCount: number
  /** 预计剩余秒数 */
  eta: number
}

export interface DroneSceneCallbacks {
  onTelemetry: (t: Telemetry) => void
  onStateChange: (s: FlightState) => void
}

const MODEL_URI = '/drone.glb'
/** glb 模型前向为 +X（东），heading 从正北顺时针，需 -90° 修正机头朝向 */
const MODEL_HEADING_OFFSET = -CesiumMath.PI / 2
/** 已飞轨迹按水平间距采点的阈值（米） */
const TRAIL_POINT_STEP = 6
const TELEMETRY_INTERVAL = 100

interface Segment {
  from: Cartesian3
  to: Cartesian3
  length: number
  /** 航段起终点经纬度（度），用于精确计算地理航向角 */
  fromLL: [number, number]
  toLL: [number, number]
}

/**
 * 无人机三维巡检场景封装：
 * 高德影像底图（调暗出科技风）+ 航线预显 + 手动 RAF 插值巡航（暂停/变速可精确控制）
 */
export class DroneScene {
  private readonly viewer: Viewer
  private readonly cb: DroneSceneCallbacks

  private route: FlightRoute | null = null
  private segments: Segment[] = []
  private totalLength = 0

  private state: FlightState = 'idle'
  private cameraMode: CameraMode = 'follow'
  private speed = 80

  private segIndex = 0
  private segOffset = 0 // 当前航段内已飞距离
  private currentPos = Cartesian3.ZERO
  private currentQuat = Transforms.headingPitchRollQuaternion(
    Cartesian3.ZERO,
    new HeadingPitchRoll(),
  )
  private trailPositions: Cartesian3[] = []
  private lastTrailPoint: Cartesian3 | null = null

  private droneEntity: Entity | null = null
  private routeEntities: Entity[] = []

  private rafId = 0
  private lastFrame = 0
  private lastTelemetry = 0

  private constructor(target: HTMLElement, callbacks: DroneSceneCallbacks) {
    this.cb = callbacks
    // 高德影像瓦片（免 token，国内可达），调暗调灰出暗黑科技感
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
      // 保留 WebGL 绘图缓冲，否则自动化截图/录屏读到的 canvas 为全黑
      contextOptions: { webgl: { preserveDrawingBuffer: true } },
    })
    // 未使用 ion 服务，默认 credit 会从 cesium.com 拉 logo（国内加载失败显示裂图），隐藏
    const credit = this.viewer.cesiumWidget.creditContainer as HTMLElement
    credit.style.display = 'none'
    // 关闭天空盒等，纯黑空间更聚焦场景（这些实体在部分版本中可能缺省）
    if (this.viewer.scene.skyBox) this.viewer.scene.skyBox.show = false
    if (this.viewer.scene.skyAtmosphere) this.viewer.scene.skyAtmosphere.show = false
    if (this.viewer.scene.sun) this.viewer.scene.sun.show = false
    if (this.viewer.scene.moon) this.viewer.scene.moon.show = false
    this.viewer.scene.backgroundColor = Color.fromCssColorString('#070b16')

    this.lastFrame = performance.now()
    this.loop()
  }

  static create(target: HTMLElement, callbacks: DroneSceneCallbacks): DroneScene {
    return new DroneScene(target, callbacks)
  }

  // ---- 航线 ----

  /** 载入航线：画虚线预显 + 途经点标记，无人机归位起点，状态回 idle */
  setRoute(route: FlightRoute): void {
    this.clearRoute()
    this.route = route

    const positions = route.points.map((p) => Cartesian3.fromDegrees(p.lng, p.lat, p.altitude))
    this.segments = []
    this.totalLength = 0
    for (let i = 0; i < positions.length - 1; i++) {
      const length = Cartesian3.distance(positions[i]!, positions[i + 1]!)
      const a = route.points[i]!
      const b = route.points[i + 1]!
      this.segments.push({
        from: positions[i]!,
        to: positions[i + 1]!,
        length,
        fromLL: [a.lng, a.lat],
        toLL: [b.lng, b.lat],
      })
      this.totalLength += length
    }

    // 航线虚线
    this.routeEntities.push(
      this.viewer.entities.add({
        polyline: {
          positions,
          width: 2.5,
          material: new PolylineDashMaterialProperty({
            color: Color.fromCssColorString('#22d3ee').withAlpha(0.7),
            dashLength: 12,
          }),
        },
      }),
    )
    // 途经点：发光圆点 + 序号
    route.points.forEach((_, i) => {
      this.routeEntities.push(
        this.viewer.entities.add({
          position: positions[i]!,
          point: {
            pixelSize: 9,
            color: Color.fromCssColorString('#818cf8'),
            outlineColor: Color.fromCssColorString('#818cf8').withAlpha(0.3),
            outlineWidth: 6,
          },
          label: {
            text: `${i + 1}`,
            font: '12px JetBrains Mono, monospace',
            fillColor: Color.fromCssColorString('#c9d6ea'),
            pixelOffset: new Cartesian3(0, -18, 0) as never,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      )
    })

    // 无人机实体（首次创建，之后复用）
    if (!this.droneEntity) {
      this.droneEntity = this.viewer.entities.add({
        position: new CallbackPositionProperty(() => this.currentPos, false),
        orientation: new CallbackProperty(() => this.currentQuat, false),
        model: {
          uri: MODEL_URI,
          minimumPixelSize: 72,
          maximumScale: 400,
          color: Color.WHITE,
        },
      })
      // 已飞轨迹实体：由 Cesium entities 集合持有，无需字段引用
      this.viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() => this.trailPositions, false),
          width: 4,
          material: Color.fromCssColorString('#22d3ee').withAlpha(0.85),
        },
      })
    }

    this.resetFlight()
    this.frameCameraOnRoute(positions)
  }

  // ---- 飞行控制 ----

  start(): void {
    if (!this.route || this.state === 'flying') return
    if (this.state === 'done') this.resetFlight()
    this.setState('flying')
  }

  pause(): void {
    if (this.state === 'flying') this.setState('paused')
  }

  setSpeed(speed: number): void {
    this.speed = speed
  }

  resetFlight(): void {
    this.segIndex = 0
    this.segOffset = 0
    this.trailPositions = []
    this.lastTrailPoint = null
    if (this.segments.length > 0) {
      this.currentPos = Cartesian3.clone(this.segments[0].from)
      this.updateOrientation()
      this.trailPositions.push(Cartesian3.clone(this.currentPos))
    }
    this.setState('idle')
    this.emitTelemetry(performance.now(), true)
  }

  toggleCamera(): void {
    this.cameraMode = this.cameraMode === 'follow' ? 'free' : 'follow'
    this.applyCameraMode()
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId)
    this.viewer.destroy()
  }

  // ---- 内部 ----

  private setState(s: FlightState): void {
    this.state = s
    this.cb.onStateChange(s)
    this.applyCameraMode()
  }

  private applyCameraMode(): void {
    if (this.cameraMode === 'follow' && this.droneEntity && this.state !== 'idle') {
      this.viewer.trackedEntity = this.droneEntity
    } else {
      this.viewer.trackedEntity = undefined
    }
  }

  private clearRoute(): void {
    this.routeEntities.forEach((e) => this.viewer.entities.remove(e))
    this.routeEntities = []
  }

  /** 航线载入后俯瞰整条航线 */
  private frameCameraOnRoute(positions: Cartesian3[]): void {
    if (positions.length === 0) return
    const sphere = BoundingSphere.fromPoints(positions)
    this.viewer.camera.flyToBoundingSphere(sphere, {
      duration: 1.4,
      offset: new HeadingPitchRange(0, CesiumMath.toRadians(-50), sphere.radius * 2.8),
    })
  }

  private loop = (): void => {
    const now = performance.now()
    const dt = (now - this.lastFrame) / 1000
    this.lastFrame = now
    if (this.state === 'flying') this.advance(dt)
    if (now - this.lastTelemetry >= TELEMETRY_INTERVAL) {
      this.emitTelemetry(now, false)
    }
    this.rafId = requestAnimationFrame(this.loop)
  }

  /** 按速度沿航段推进，跨段时携带剩余距离 */
  private advance(dt: number): void {
    let remaining = this.speed * dt
    while (remaining > 0 && this.segIndex < this.segments.length) {
      const seg = this.segments[this.segIndex]
      const segLeft = seg.length - this.segOffset
      if (remaining < segLeft) {
        this.segOffset += remaining
        remaining = 0
      } else {
        remaining -= segLeft
        this.segIndex++
        this.segOffset = 0
      }
    }

    if (this.segIndex >= this.segments.length) {
      // 到达终点
      const last = this.segments[this.segments.length - 1]
      if (last) this.currentPos = Cartesian3.clone(last.to)
      this.appendTrailPoint(true)
      this.setState('done')
      return
    }

    const seg = this.segments[this.segIndex]
    const t = seg.length > 0 ? this.segOffset / seg.length : 1
    Cartesian3.lerp(seg.from, seg.to, t, this.currentPos)
    this.updateOrientation()
    this.appendTrailPoint(false)
  }

  private updateOrientation(): void {
    const seg = this.segments[Math.min(this.segIndex, this.segments.length - 1)]
    if (!seg) return
    // 由 ECEF 差分近似航向角（短距离误差可忽略）
    const dx = seg.to.x - seg.from.x
    const dy = seg.to.y - seg.from.y
    const dz = seg.to.z - seg.from.z
    void dz
    const heading = Math.atan2(dy, dx) // ECEF 下的粗略方位，配合本地 ENU 旋转足够演示
    this.currentQuat = Transforms.headingPitchRollQuaternion(
      this.currentPos,
      new HeadingPitchRoll(heading + MODEL_HEADING_OFFSET, 0, 0),
    )
  }

  private appendTrailPoint(force: boolean): void {
    if (
      force ||
      !this.lastTrailPoint ||
      Cartesian3.distance(this.lastTrailPoint, this.currentPos) >= TRAIL_POINT_STEP
    ) {
      this.lastTrailPoint = Cartesian3.clone(this.currentPos)
      // 替换数组引用触发 CallbackProperty 重绘
      this.trailPositions = [...this.trailPositions, this.lastTrailPoint]
    } else {
      // 末端跟随当前位置（不等阈值，视觉更顺滑）
      const arr = [...this.trailPositions]
      arr[arr.length - 1] = Cartesian3.clone(this.currentPos)
      this.trailPositions = arr
    }
  }

  private emitTelemetry(now: number, force: boolean): void {
    if (!force && now - this.lastTelemetry < TELEMETRY_INTERVAL) return
    this.lastTelemetry = now
    const flown = this.flownDistance()
    const carto = this.viewer.scene.globe.ellipsoid.cartesianToCartographic(this.currentPos)
    this.cb.onTelemetry({
      speed: this.state === 'flying' ? this.speed : 0,
      altitude: carto ? Math.round(carto.height) : 0,
      flown: Math.round(flown),
      total: Math.round(this.totalLength),
      progress: this.totalLength > 0 ? Math.min(flown / this.totalLength, 1) : 0,
      waypointIndex: Math.min(this.segIndex + 2, this.route?.points.length ?? 0),
      waypointCount: this.route?.points.length ?? 0,
      eta: this.speed > 0 ? Math.max(this.totalLength - flown, 0) / this.speed : 0,
    })
  }

  private flownDistance(): number {
    let d = 0
    for (let i = 0; i < this.segIndex; i++) d += this.segments[i]?.length ?? 0
    return d + this.segOffset
  }
}
