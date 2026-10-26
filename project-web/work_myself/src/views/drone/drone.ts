import { computed, onBeforeUnmount, onMounted, ref, type ShallowRef } from 'vue'
import {
  getDroneDetail,
  getDroneSnapshot,
  type DroneBrief,
  type DroneDetail,
  type DroneSnapshot,
  type DroneStats,
  type DroneStation,
  type DroneStatus,
} from '@/api/drone'
import { toast } from '@/utils/toast'
import { FleetScene, STATUS_COLOR } from './cesium'

/** 快照轮询间隔：后端每秒推演一拍，前端 2s 拉一次（线上带宽约 30KB/s） */
const POLL_MS = 2000

export const STATUS_META: Record<DroneStatus, { label: string; color: string }> = {
  standby: { label: '待命', color: STATUS_COLOR.standby },
  takeoff: { label: '起飞中', color: STATUS_COLOR.takeoff },
  delivering: { label: '配送中', color: STATUS_COLOR.delivering },
  landing: { label: '降落中', color: STATUS_COLOR.landing },
  returning: { label: '返航中', color: STATUS_COLOR.returning },
  charging: { label: '充电中', color: STATUS_COLOR.charging },
}

/** 状态展示顺序：图例与筛选项共用 */
export const STATUS_ORDER: DroneStatus[] = [
  'delivering',
  'returning',
  'takeoff',
  'landing',
  'standby',
  'charging',
]

export type StatusFilter = DroneStatus | 'all'

/** 物流机队监控逻辑：快照轮询 + 状态筛选 + 点选详情 + 视角跟随 */
export function useDroneScreen(cesiumEl: Readonly<ShallowRef<HTMLElement | null>>) {
  let scene: FleetScene | null = null
  let timer = 0
  let disposed = false
  let firstFail = true

  const loading = ref(true)
  const live = ref(true)
  const connected = ref(true)
  const snapshot = ref<DroneSnapshot | null>(null)
  const statusFilter = ref<StatusFilter>('all')
  const keyword = ref('')
  const selectedId = ref<string | null>(null)
  const detail = ref<DroneDetail | null>(null)
  const follow = ref(false)
  const hoverInfo = ref<{ id: string; x: number; y: number } | null>(null)
  const lastUpdated = ref<number | null>(null)

  const stats = computed<DroneStats | null>(() => snapshot.value?.stats ?? null)
  const drones = computed<DroneBrief[]>(() => snapshot.value?.drones ?? [])
  const baseName = computed(() => stats.value?.base.name ?? '新街口物流基站')

  const statusCounts = computed<Record<DroneStatus, number>>(() => {
    const counts: Record<DroneStatus, number> = {
      standby: 0,
      takeoff: 0,
      delivering: 0,
      landing: 0,
      returning: 0,
      charging: 0,
    }
    const by = stats.value?.by_status ?? {}
    for (const s of STATUS_ORDER) counts[s] = by[s] ?? 0
    return counts
  })

  /** 空中作业数：起飞 + 配送 + 降落 + 返航 */
  const activeCount = computed(
    () =>
      statusCounts.value.takeoff +
      statusCounts.value.delivering +
      statusCounts.value.landing +
      statusCounts.value.returning,
  )

  const filteredDrones = computed<DroneBrief[]>(() => {
    const kw = keyword.value.trim().toLowerCase()
    return drones.value.filter((d) => {
      if (statusFilter.value !== 'all' && d.status !== statusFilter.value) return false
      if (!kw) return true
      return (
        d.id.toLowerCase().includes(kw) ||
        (d.order_id ?? '').toLowerCase().includes(kw) ||
        (d.station?.name ?? '').toLowerCase().includes(kw)
      )
    })
  })

  const selectedBrief = computed<DroneBrief | null>(
    () => drones.value.find((d) => d.id === selectedId.value) ?? null,
  )

  const hoveredDrone = computed<DroneBrief | null>(() => {
    const info = hoverInfo.value
    if (!info) return null
    return drones.value.find((d) => d.id === info.id) ?? null
  })

  const updatedText = computed(() =>
    lastUpdated.value
      ? new Date(lastUpdated.value * 1000).toLocaleTimeString('zh-CN', { hour12: false })
      : '--:--:--',
  )

  // ---- 格式化 ----
  function fmtBattery(v: number): string {
    return `${v.toFixed(1)}%`
  }

  function fmtDistance(m: number): string {
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
  }

  function fmtDuration(sec: number): string {
    const s = Math.max(0, Math.round(sec))
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  function progressPercent(v: number): string {
    return `${Math.min(100, Math.max(0, v * 100)).toFixed(0)}%`
  }

  /** 电量分级：配色用（高绿 / 中黄 / 低红） */
  function batteryLevel(v: number): 'high' | 'mid' | 'low' {
    return v >= 60 ? 'high' : v >= 25 ? 'mid' : 'low'
  }

  // ---- 数据链路 ----
  function applySnapshot(res: DroneSnapshot): void {
    snapshot.value = res
    lastUpdated.value = res.ts
    connected.value = true
    loading.value = false
    scene?.setBase(res.stats.base)
    scene?.setFleet(res.drones)

    // 站点标记：从快照中出现过的配送站增量补齐
    const unique: DroneStation[] = []
    const codes = new Set<string>()
    for (const d of res.drones) {
      if (!d.station || codes.has(d.station.code)) continue
      codes.add(d.station.code)
      unique.push(d.station)
    }
    scene?.setStations(unique)
  }

  async function pull(): Promise<void> {
    if (disposed) return
    try {
      const res = await getDroneSnapshot()
      if (disposed) return
      applySnapshot(res)
      if (selectedId.value) void refreshDetail()
    } catch {
      connected.value = false
      loading.value = false
      if (firstFail) {
        firstFail = false
        toast.error('机队数据加载失败，请确认后端服务已启动')
      }
    } finally {
      if (live.value && !disposed) timer = window.setTimeout(() => void pull(), POLL_MS)
    }
  }

  /** 选中机详情：每轮快照同步一次，保证航线与订单状态不滞后 */
  async function refreshDetail(): Promise<void> {
    const id = selectedId.value
    if (!id) return
    try {
      const res = await getDroneDetail(id)
      if (id !== selectedId.value) return
      detail.value = res
      scene?.updateRoute(res.route)
    } catch {
      // 详情失败不打断主流程，快照仍在刷新
    }
  }

  // ---- 交互 ----
  function selectDrone(id: string): void {
    selectedId.value = id
    detail.value = null
    hoverInfo.value = null
    follow.value = false
    scene?.selectDrone(id)
    void refreshDetail()
  }

  function clearSelection(): void {
    selectedId.value = null
    detail.value = null
    follow.value = false
    scene?.clearSelection()
  }

  function backToOverview(): void {
    clearSelection()
    scene?.overview()
  }

  function toggleFollow(): void {
    if (!selectedId.value) return
    follow.value = !follow.value
    scene?.setFollow(follow.value)
  }

  function setStatusFilter(v: StatusFilter): void {
    statusFilter.value = v
    scene?.setFilter(v === 'all' ? null : v)
  }

  /** 暂停/恢复轮询：暂停后场景冻结在当前快照，便于讲解演示 */
  function toggleLive(): void {
    live.value = !live.value
    if (live.value) {
      void pull()
    } else {
      window.clearTimeout(timer)
      timer = 0
    }
  }

  onMounted(() => {
    try {
      scene = FleetScene.create(cesiumEl.value!, {
        onSelect: selectDrone,
        onHover: (id, x, y) => {
          hoverInfo.value = id ? { id, x, y } : null
        },
      })
      void pull()
    } catch {
      toast.error('三维场景初始化失败，请刷新重试')
      loading.value = false
    }
  })

  onBeforeUnmount(() => {
    disposed = true
    window.clearTimeout(timer)
    scene?.destroy()
    scene = null
  })

  return {
    loading,
    live,
    connected,
    stats,
    drones,
    baseName,
    statusFilter,
    keyword,
    statusCounts,
    activeCount,
    filteredDrones,
    selectedId,
    selectedBrief,
    detail,
    follow,
    hoverInfo,
    hoveredDrone,
    updatedText,
    STATUS_META,
    STATUS_ORDER,
    fmtBattery,
    fmtDistance,
    fmtDuration,
    progressPercent,
    batteryLevel,
    selectDrone,
    clearSelection,
    backToOverview,
    toggleFollow,
    setStatusFilter,
    toggleLive,
  }
}
