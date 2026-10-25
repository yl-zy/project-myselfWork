import { computed, onBeforeUnmount, onMounted, ref, type ShallowRef } from 'vue'
import {
  getFlows,
  getMigrationSummary,
  type FlowRecord,
  type NationSummary,
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

/** 人口流动大屏逻辑：scale 适配 + flows 增量轮询 + summary 榜单 + 实时动态 */
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

  /** 榜单条形宽度：按榜单最大值归一化 */
  function barPercent(list: RankItem[], item: RankItem): string {
    const val = item.people ?? item.value ?? 0
    const max = Math.max(...list.map((i) => i.people ?? i.value ?? 0), 1)
    return `${Math.max((val / max) * 100, 4)}%`
  }

  function fmt(n: number | undefined): string {
    return (n ?? 0).toLocaleString('zh-CN')
  }

  async function refreshSummary(): Promise<void> {
    const res = await getMigrationSummary()
    if (res.batch_time) summary.value = res as NationSummary
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
      const res = await getFlows(batchTime.value ? { since: batchTime.value } : {})
      if (res.batch_time && res.batch_time !== batchTime.value && res.records.length > 0) {
        batchTime.value = res.batch_time
        applyBatch(res.records)
        void refreshSummary()
      }
    } catch {
      // 单轮轮询失败不打扰，等下一拍（拦截器已提示网络级错误）
    }
  }

  async function boot(): Promise<void> {
    try {
      map = await MigrationMap.create(mapEl.value!)
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
  }
}
