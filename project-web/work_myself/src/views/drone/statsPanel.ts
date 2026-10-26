import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import * as echarts from 'echarts'
import type { DroneSnapshot } from '@/api/drone'
import { STATUS_META, STATUS_ORDER } from './drone'

/** 电量区间（%），左闭右开，末区间到 100：用于柱状图统计机队整体电量分布 */
const BATTERY_BINS: Array<{ label: string; lo: number; hi: number }> = [
  { label: '0-25', lo: 0, hi: 25 },
  { label: '25-50', lo: 25, hi: 50 },
  { label: '50-75', lo: 50, hi: 75 },
  { label: '75-100', lo: 75, hi: 100 },
]

/** 主题无关的画布文字色：与 drone.css 的 HUD 深色科技风一致 */
const TEXT = '#aab8cc'
const TEXT_BRIGHT = '#c9d6ea'
const BORDER = 'rgba(34, 211, 238, 0.25)'
const SPLIT = 'rgba(148, 163, 184, 0.12)'

/**
 * 数据统计图表逻辑：六态分布饼图 + 电量区间柱状图。
 * 复用 echarts（项目全局依赖），随 2s 快照实时 setOption，组件卸载时 dispose。
 * 类比前端：相当于把三维可视化的"数据层"单独剥离出可复用的图表控制器。
 */
export function useStatsPanel(
  pieEl: Readonly<Ref<HTMLElement | null>>,
  barEl: Readonly<Ref<HTMLElement | null>>,
  snapshot: Readonly<Ref<DroneSnapshot | null>>,
): void {
  let pie: echarts.ECharts | null = null
  let bar: echarts.ECharts | null = null
  let ro: ResizeObserver | null = null

  function render(s: DroneSnapshot | null): void {
    if (!s || !pie || !bar) return
    pie.setOption(buildPieOption(s))
    bar.setOption(buildBarOption(s))
  }

  onMounted(() => {
    if (pieEl.value) pie = echarts.init(pieEl.value)
    if (barEl.value) bar = echarts.init(barEl.value)

    // 面板随窗口宽度响应式缩放时同步图表尺寸
    const target = pieEl.value ?? barEl.value
    if (target && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        pie?.resize()
        bar?.resize()
      })
      ro.observe(target)
    }
    render(snapshot.value)
  })

  watch(snapshot, render)

  onBeforeUnmount(() => {
    ro?.disconnect()
    ro = null
    pie?.dispose()
    pie = null
    bar?.dispose()
    bar = null
  })
}

function buildPieOption(s: DroneSnapshot): echarts.EChartsCoreOption {
  const by = s.stats.by_status
  const data = STATUS_ORDER.map((st) => ({
    name: STATUS_META[st].label,
    value: by[st] ?? 0,
    itemStyle: { color: STATUS_META[st].color },
  }))
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(7, 11, 22, 0.94)',
      borderColor: BORDER,
      textStyle: { color: TEXT_BRIGHT, fontSize: 11 },
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      itemWidth: 8,
      itemHeight: 8,
      icon: 'circle',
      textStyle: { color: TEXT, fontSize: 10 },
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '42%'],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: 'rgba(7, 11, 22, 0.8)', borderWidth: 1 },
        data,
      },
    ],
  }
}

function buildBarOption(s: DroneSnapshot): echarts.EChartsCoreOption {
  const counts = BATTERY_BINS.map((b) =>
    s.drones.filter((d) => d.battery >= b.lo && d.battery < b.hi).length,
  )
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(7, 11, 22, 0.94)',
      borderColor: BORDER,
      textStyle: { color: TEXT_BRIGHT, fontSize: 11 },
    },
    grid: { left: 30, right: 8, top: 26, bottom: 22 },
    xAxis: {
      type: 'category',
      data: BATTERY_BINS.map((b) => b.label),
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.3)' } },
      axisTick: { show: false },
      axisLabel: { color: TEXT, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: SPLIT } },
      axisLabel: { color: TEXT, fontSize: 10 },
    },
    series: [
      {
        type: 'bar',
        data: counts,
        barWidth: '48%',
        itemStyle: {
          borderRadius: [3, 3, 0, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#22d3ee' },
              { offset: 1, color: '#818cf8' },
            ],
          },
        },
        label: {
          show: true,
          position: 'top',
          color: TEXT_BRIGHT,
          fontSize: 10,
        },
      },
    ],
  }
}