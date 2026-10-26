import { computed, onBeforeUnmount, onMounted, ref, type ShallowRef } from 'vue'
import {
  getFlows,
  getMigrationSummary,
  type FlowQuery,
  type FlowRecord,
  type NationSummary,
  type ProvinceSummary,
  type RankItem,
} from '@/api/migration'
import { toast } from '@/utils/toast'
import { MigrationMap } from './map'

export interface FeedItem {
  id: number
  from: string
  to: string
  people: number
}

const DESIGN_W = 1920
const DESIGN_H = 1080
const POLL_INTERVAL = 5000
const FEED_LIMIT = 18

/** 人口流动大屏逻辑：scale 适配 + flows 增量轮询 + summary 榜单 + 实时动态 + 省份点选下钻 */
export function useMigrationScreen(mapEl: Readonly<ShallowRef<HTMLElement | null>>) {
  let map: MigrationMap | null = null

  const screenScale = ref(1)
  const loading = ref(true)
  const batchTime = ref<string | null>(null)
  const summary = ref<NationSummary | null>(null)
  const feed = ref<FeedItem[]>([])
  const batchPeople = ref(0)
  const batchPairs = ref(0)
  let feedSeq = 0
  let pollTimer = 0

  // ---- 省份下钻视角：null 为全国 ----
  const selectedProvince = ref<{ code: string; name: string } | null>(null)
  const provSummary = ref<ProvinceSummary | null>(null)
  const hoverTip = ref<{ name: string; x: number; y: number } | null>(null)

  // ---- 大屏等比缩放：设计稿 1920×1080，按视口取较小比例居中 ----
  const scaleStyle = computed(() => ({
    transform: `translate(-50%, -50%) scale(${screenScale.value})`,
  }))

  function updateScale(): void {
    screenScale.value = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H)
  }

  // ---- 数据 ----
  const batchTimeText = computed(() => {
    if (!batchTime.value) return '--'
    return new Date(batchTime.value).toLocaleTimeString('zh-CN', { hour12: false })
  })

  const topIn = computed<RankItem[]>(() => summary.value?.top_in ?? [])
  const topOut = computed<RankItem[]>(() => summary.value?.top_out ?? [])
  const topNetIn = computed<RankItem[]>(() => summary.value?.top_net_in ?? [])
  // 省级视角榜单：迁入来源 / 迁出去向
  const inFromList = computed<RankItem[]>(() => provSummary.value?.in_from ?? [])
  const outToList = computed<RankItem[]>(() => provSummary.value?.out_to ?? [])

  /** 榜单条形宽度：按榜单最大值归一化 */
  function barPercent(list: RankItem[], item: RankItem): string {
    const val = item.people ?? item.value ?? 0
    const max = Math.max(...list.map((i) => i.people ?? i.value ?? 0), 1)
    return `${Math.max((val / max) * 100, 4)}%`
  }

  function fmt(n: number | undefined): string {
    return (n ?? 0).toLocaleString('zh-CN')
  }

  /** 带符号数字：净流入展示用 */
  function fmtSigned(n: number | undefined): string {
    const v = n ?? 0
    return (v > 0 ? '+' : '') + v.toLocaleString('zh-CN')
  }

  async function refreshSummary(): Promise<void> {
    if (selectedProvince.value) {
      const res = await getMigrationSummary({
        level: 'province',
        province: selectedProvince.value.code,
      })
      provSummary.value = res as ProvinceSummary
    } else {
      const res = await getMigrationSummary()
      if (res.batch_time) summary.value = res as NationSummary
    }
  }

  /** 一批新数据到达：飞线上屏 + 动态流 + 榜单刷新 */
  function applyBatch(records: FlowRecord[]): void {
    if (!map || records.length === 0) return
    map.addFlows(records)
    batchPeople.value = records.reduce((sum, r) => sum + r.people, 0)
    batchPairs.value = records.length

    const items = [...records]
      .sort((a, b) => b.people - a.people)
      .slice(0, 6)
      .map((r) => ({
        id: ++feedSeq,
        from: map!.getProvince(r.from_code)?.name ?? r.from_code,
        to: map!.getProvince(r.to_code)?.name ?? r.to_code,
        people: r.people,
      }))
    feed.value = [...items, ...feed.value].slice(0, FEED_LIMIT)
  }

  async function poll(): Promise<void> {
    try {
      const params: FlowQuery = batchTime.value ? { since: batchTime.value } : {}
      if (selectedProvince.value) {
        params.level = 'province'
        params.province = selectedProvince.value.code
      }
      const res = await getFlows(params)
      if (res.batch_time && res.batch_time !== batchTime.value && res.records.length > 0) {
        batchTime.value = res.batch_time
        applyBatch(res.records)
        void refreshSummary()
      }
    } catch {
      // 单轮轮询失败不打扰，等下一拍（拦截器已提示网络级错误）
    }
  }

  /** 点选省份切换视角（再点同一省或传 null 返回全国）：重置批次基线并重铺飞线 */
  function selectProvince(code: string | null): void {
    if (code && selectedProvince.value?.code === code) code = null
    if (code) {
      const info = map?.getProvince(code)
      if (!info) return
      selectedProvince.value = { code: info.code, name: info.name }
    } else {
      selectedProvince.value = null
    }
    provSummary.value = null
    map?.setSelected(code)
    map?.clearFlows()
    batchTime.value = null
    feed.value = []
    batchPeople.value = 0
    batchPairs.value = 0
    void poll()
    void refreshSummary()
  }

  async function boot(): Promise<void> {
    try {
      map = await MigrationMap.create(mapEl.value!)
      map.onHover((h) => {
        hoverTip.value = h ? { name: h.name, x: h.pixel[0], y: h.pixel[1] } : null
      })
      map.onSelect((code) => selectProvince(code))
      await Promise.all([poll(), refreshSummary()])
    } catch {
      toast.error('大屏初始化失败，请刷新重试')
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    updateScale()
    window.addEventListener('resize', updateScale)
    void boot()
    pollTimer = window.setInterval(poll, POLL_INTERVAL)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateScale)
    window.clearInterval(pollTimer)
    map?.destroy()
    map = null
  })

  return {
    scaleStyle,
    loading,
    batchTimeText,
    batchPeople,
    batchPairs,
    topIn,
    topOut,
    topNetIn,
    feed,
    barPercent,
    fmt,
    fmtSigned,
    selectedProvince,
    provSummary,
    inFromList,
    outToList,
    hoverTip,
    selectProvince,
  }
}
