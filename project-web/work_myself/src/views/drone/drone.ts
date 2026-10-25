import { computed, onBeforeUnmount, onMounted, ref, type ShallowRef } from 'vue'
import { getFlightRoutes, type FlightRoute } from '@/api/flight'
import { toast } from '@/utils/toast'
import { DroneScene, type CameraMode, type FlightState, type Telemetry } from './cesium'

const SPEED_OPTIONS = [
  { label: '低速', value: 40 },
  { label: '标准', value: 80 },
  { label: '高速', value: 160 },
]

const STATE_TEXT: Record<FlightState, string> = {
  idle: '待机',
  flying: '巡航中',
  paused: '已暂停',
  done: '已完成',
}

/** 无人机三维巡检逻辑：航线加载 + 飞行控制 + 遥测数据桥接 */
export function useDroneScreen(cesiumEl: Readonly<ShallowRef<HTMLElement | null>>) {
  let scene: DroneScene | null = null

  const loading = ref(true)
  const routes = ref<FlightRoute[]>([])
  const currentRouteId = ref<number | null>(null)
  const state = ref<FlightState>('idle')
  const speed = ref(80)
  const cameraMode = ref<CameraMode>('follow')
  const telemetry = ref<Telemetry>({
    speed: 0,
    altitude: 0,
    flown: 0,
    total: 0,
    progress: 0,
    waypointIndex: 0,
    waypointCount: 0,
    eta: 0,
  })

  const stateText = computed(() => STATE_TEXT[state.value])
  const currentRoute = computed(
    () => routes.value.find((r) => r.id === currentRouteId.value) ?? null,
  )
  const progressPercent = computed(() => `${(telemetry.value.progress * 100).toFixed(1)}%`)

  function fmtDistance(m: number): string {
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
  }

  function fmtEta(seconds: number): string {
    const s = Math.ceil(seconds)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  /** 航线里程（页面侧与场景侧口径一致，列表展示用） */
  function routeLength(route: FlightRoute): number {
    let d = 0
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i]
      const b = route.points[i + 1]
      const dx = (b.lng - a.lng) * 111320 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))
      const dy = (b.lat - a.lat) * 110540
      d += Math.hypot(dx, dy)
    }
    return d
  }

  function selectRoute(id: number): void {
    if (state.value === 'flying') return
    const route = routes.value.find((r) => r.id === id)
    if (!route || !scene) return
    currentRouteId.value = id
    scene.setRoute(route)
  }

  function start(): void {
    scene?.start()
  }

  function pauseOrResume(): void {
    if (state.value === 'flying') scene?.pause()
    else if (state.value === 'paused') scene?.start()
  }

  function reset(): void {
    scene?.resetFlight()
  }

  function setSpeed(v: number): void {
    speed.value = v
    scene?.setSpeed(v)
  }

  function toggleCamera(): void {
    scene?.toggleCamera()
    cameraMode.value = cameraMode.value === 'follow' ? 'free' : 'follow'
  }

  onMounted(async () => {
    try {
      scene = DroneScene.create(cesiumEl.value!, {
        onTelemetry: (t) => (telemetry.value = t),
        onStateChange: (s) => (state.value = s),
      })
      scene.setSpeed(speed.value)
      const res = await getFlightRoutes()
      routes.value = res.routes
      if (routes.value.length > 0) {
        const first = routes.value[0]
        currentRouteId.value = first.id
        scene.setRoute(first)
      }
    } catch {
      toast.error('三维场景初始化失败，请刷新重试')
    } finally {
      loading.value = false
    }
  })

  onBeforeUnmount(() => {
    scene?.destroy()
    scene = null
  })

  return {
    loading,
    routes,
    currentRouteId,
    currentRoute,
    state,
    stateText,
    telemetry,
    speed,
    cameraMode,
    progressPercent,
    SPEED_OPTIONS,
    fmtDistance,
    fmtEta,
    routeLength,
    selectRoute,
    start,
    pauseOrResume,
    reset,
    setSpeed,
    toggleCamera,
  }
}
