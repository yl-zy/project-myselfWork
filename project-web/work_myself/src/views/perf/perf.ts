import { computed, onBeforeUnmount, onMounted, ref, type ShallowRef } from 'vue'
import * as echarts from 'echarts'
import {
  clearPerfEvents,
  getPerfErrors,
  getPerfSummary,
  type MetricP75,
  type PerfErrorItem,
  type PerfSummary,
} from '@/api/perf'
import { useUserStore } from '@/store/user'
import { toast } from '@/utils/toast'

type Range = '1d' | '3d' | '7d'

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: '1d', label: '近 24 小时' },
  { value: '3d', label: '近 3 天' },
  { value: '7d', label: '近 7 天' },
]

/** 核心 Web Vitals 指标评级阈值（Google 标准） */
const METRIC_THRESHOLDS: Record<string, { good: number; poor: number; unit: string }> = {
  LCP: { good: 2500, poor: 4000, unit: 'ms' },
  FCP: { good: 1800, poor: 3000, unit: 'ms' },
  INP: { good: 200, poor: 500, unit: 'ms' },
  TTFB: { good: 800, poor: 1800, unit: 'ms' },
  CLS: { good: 0.1, poor: 0.25, unit: '' },
}

const VITAL_NAMES = ['LCP', 'FCP', 'INP', 'TTFB', 'CLS']

/** 性能仪表盘逻辑 */
export function usePerfDashboard(
  trendEl: Readonly<ShallowRef<HTMLElement | null>>,
  pageEl: Readonly<ShallowRef<HTMLElement | null>>,
) {
  const userStore = useUserStore()

  const range = ref<Range>('1d')
  const summary = ref<PerfSummary | null>(null)
  const errors = ref<PerfErrorItem[]>([])
  const errorTotal = ref(0)
  const errorPage = ref(1)
  const errorSize = 10
  const loading = ref(false)

  let trendChart: echarts.ECharts | null = null
  let pageChart: echarts.ECharts | null = null

  const isAdmin = computed(() => userStore.user?.role === 'admin')

  // ---- 指标卡片（只展示核心 Web Vitals）----
  const vitalMetrics = computed<MetricP75[]>(() => {
    const all = summary.value?.metrics ?? []
    return VITAL_NAMES.map((name) => all.find((m) => m.name === name) ?? { name, p75: null, count: 0 })
  })

  /** 评级等级 + 颜色 */
  function rateMetric(m: MetricP75): { level: 'good' | 'ni' | 'poor' | 'none'; color: string; label: string } {
    if (m.p75 === null || m.count === 0) return { level: 'none', color: '#64748b', label: '无数据' }
    const th = METRIC_THRESHOLDS[m.name]
    if (!th) return { level: 'none', color: '#64748b', label: '无数据' }
    if (m.p75 <= th.good) return { level: 'good', color: '#34d399', label: '良好' }
    if (m.p75 <= th.poor) return { level: 'ni', color: '#fbbf24', label: '需改进' }
    return { level: 'poor', color: '#f87171', label: '较差' }
  }

  function formatValue(m: MetricP75): string {
    if (m.p75 === null) return '--'
    const th = METRIC_THRESHOLDS[m.name]
    if (!th) return String(m.p75)
    if (th.unit === '') return m.p75.toFixed(2)
    return `${Math.round(m.p75)}${th.unit}`
  }

  // ---- 趋势图数据 ----
  const trendSeries = computed(() => {
    const trend = summary.value?.trend ?? []
    if (trend.length === 0) return { hours: [], series: [] }
    const hours = Array.from(new Set(trend.map((t) => t.hour))).sort()
    const names = Array.from(new Set(trend.map((t) => t.name)))
    const series = names.map((name) => ({
      name,
      data: hours.map((h) => {
        const p = trend.find((t) => t.hour === h && t.name === name)
        return p ? Math.round(p.avg) : null
      }),
    }))
    return { hours, series }
  })

  function renderTrendChart(): void {
    if (!trendChart) return
    const { hours, series } = trendSeries.value
    trendChart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(148,163,184,0.2)',
        textStyle: { color: '#e6edf7', fontSize: 12 },
      },
      legend: {
        data: series.map((s) => s.name),
        textStyle: { color: '#94a3b8', fontSize: 11 },
        top: 0,
        right: 10,
      },
      grid: { left: 50, right: 20, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: hours,
        axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
        axisLabel: { color: '#64748b', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } },
      },
      series: series.map((s, i) => ({
        name: s.name,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: s.data,
        itemStyle: { color: chartColors[i % chartColors.length] },
        lineStyle: { width: 2, color: chartColors[i % chartColors.length] },
        areaStyle: { opacity: 0.08 },
      })),
    })
  }

  const chartColors = ['#22d3ee', '#818cf8', '#34d399', '#fbbf24', '#f87171']

  // ---- 页面排行柱状图 ----
  function renderPageChart(): void {
    if (!pageChart) return
    const pages = (summary.value?.pages ?? []).slice(0, 10)
    pageChart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(148,163,184,0.2)',
        textStyle: { color: '#e6edf7', fontSize: 12 },
      },
      grid: { left: 100, right: 20, top: 10, bottom: 20 },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } },
      },
      yAxis: {
        type: 'category',
        data: pages.map((p) => p.page).reverse(),
        axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
        axisLabel: { color: '#94a3b8', fontSize: 11, width: 90, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          data: pages.map((p) => p.count).reverse(),
          barWidth: 14,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#22d3ee' },
              { offset: 1, color: '#818cf8' },
            ]),
          },
        },
      ],
    })
  }

  // ---- 数据拉取 ----
  async function loadSummary(): Promise<void> {
    loading.value = true
    try {
      const res = await getPerfSummary({ range: range.value })
      summary.value = res
      renderTrendChart()
      renderPageChart()
    } catch {
      // 拦截器已提示
    } finally {
      loading.value = false
    }
  }

  async function loadErrors(): Promise<void> {
    try {
      const res = await getPerfErrors({ page: errorPage.value, size: errorSize })
      errors.value = res.list
      errorTotal.value = res.total
    } catch {
      // ignore
    }
  }

  function changeRange(r: Range): void {
    range.value = r
    void loadSummary()
  }

  function changeErrorPage(p: number): void {
    errorPage.value = p
    void loadErrors()
  }

  async function handleClear(): Promise<void> {
    if (!isAdmin.value) return
    if (!confirm('确定清空所有性能事件数据？此操作不可恢复。')) return
    try {
      const res = await clearPerfEvents()
      toast.success(`已清空 ${res.deleted} 条事件`)
      errorPage.value = 1
      await Promise.all([loadSummary(), loadErrors()])
    } catch {
      // ignore
    }
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  }

  // ---- 初始化与销毁 ----
  onMounted(() => {
    if (trendEl.value) trendChart = echarts.init(trendEl.value)
    if (pageEl.value) pageChart = echarts.init(pageEl.value)
    void loadSummary()
    void loadErrors()
  })

  onBeforeUnmount(() => {
    trendChart?.dispose()
    pageChart?.dispose()
    trendChart = null
    pageChart = null
  })

  return {
    RANGE_OPTIONS,
    range,
    loading,
    vitalMetrics,
    rateMetric,
    formatValue,
    errors,
    errorTotal,
    errorPage,
    errorSize,
    isAdmin,
    changeRange,
    changeErrorPage,
    handleClear,
    formatTime,
  }
}
