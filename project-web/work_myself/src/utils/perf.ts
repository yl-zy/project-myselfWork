import { reportPerfEvents, type PerfEventInput } from '@/api/perf'
import { getVisitorId } from '@/utils/storage'

/**
 * 性能采集 SDK：Web Vitals（LCP/CLS/FCP/TTFB/INP）+ API 耗时 + 全局错误。
 * 批量上报：5 秒定时或满 10 条触发，单批 ≤ 50 条。
 */

const queue: PerfEventInput[] = []
const FLUSH_INTERVAL = 5000
const BATCH_MAX = 50
let flushTimer = 0
let inited = false

/** 当前页面路由（由路由钩子更新） */
let currentPage = location.pathname

export function setCurrentPage(path: string): void {
  currentPage = path
}

function pushEvent(event: Omit<PerfEventInput, 'visitor_id'>): void {
  if (queue.length >= BATCH_MAX) void flush()
  queue.push({ ...event, visitor_id: getVisitorId() })
  if (queue.length >= 10) void flush()
}

async function flush(): Promise<void> {
  if (queue.length === 0) return
  const batch = queue.splice(0, BATCH_MAX)
  try {
    await reportPerfEvents(batch)
  } catch {
    // 上报失败不重试，避免堆积（演示场景）
  }
}

/** Web Vitals 采集 */
function initWebVitals(): void {
  // LCP
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const last = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; loadTime?: number }
      const value = last.renderTime || last.loadTime || last.startTime
      if (value > 0) {
        pushEvent({ event_type: 'metric', page: currentPage, name: 'LCP', value: Math.round(value) })
      }
    })
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {
    /* 浏览器不支持 */
  }

  // FCP
  try {
    const fcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          pushEvent({
            event_type: 'metric',
            page: currentPage,
            name: 'FCP',
            value: Math.round(entry.startTime),
          })
        }
      }
    })
    fcpObserver.observe({ type: 'paint', buffered: true })
  } catch {
    /* ignore */
  }

  // CLS（session 内累加）
  try {
    let clsValue = 0
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
        if (!entry.hadRecentInput) clsValue += entry.value ?? 0
      }
      pushEvent({ event_type: 'metric', page: currentPage, name: 'CLS', value: Math.round(clsValue * 1000) / 1000 })
    })
    clsObserver.observe({ type: 'layout-shift', buffered: true })
  } catch {
    /* ignore */
  }

  // TTFB
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav) {
      pushEvent({
        event_type: 'metric',
        page: currentPage,
        name: 'TTFB',
        value: Math.round(nav.responseStart),
      })
    }
  } catch {
    /* ignore */
  }

  // INP（简化：取所有交互事件最大 duration）
  try {
    let maxDuration = 0
    const inpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { duration?: number; interactionId?: number }>) {
        if (entry.interactionId && (entry.duration ?? 0) > maxDuration) {
          maxDuration = entry.duration ?? 0
          pushEvent({
            event_type: 'metric',
            page: currentPage,
            name: 'INP',
            value: Math.round(maxDuration),
          })
        }
      }
    })
    inpObserver.observe({ type: 'event', buffered: true })
  } catch {
    /* ignore */
  }
}

/** 全局错误采集 */
function initErrorCapture(): void {
  window.addEventListener('error', (e) => {
    pushEvent({
      event_type: 'error',
      page: currentPage,
      name: e.message || 'Script Error',
      extra: {
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        stack: e.error?.stack?.slice(0, 500),
      },
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    pushEvent({
      event_type: 'error',
      page: currentPage,
      name: 'Unhandled Rejection',
      extra: {
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack?.slice(0, 500) : undefined,
      },
    })
  })
}

/** API 耗时上报（由 request 拦截器调用） */
export function reportApiDuration(page: string, name: string, duration: number, extra?: Record<string, unknown>): void {
  pushEvent({ event_type: 'api', page, name, value: Math.round(duration), extra })
}

/** 初始化性能采集（在应用启动时调用一次） */
export function initPerf(): void {
  if (inited) return
  inited = true

  initWebVitals()
  initErrorCapture()

  // 定时批量上报
  flushTimer = window.setInterval(() => void flush(), FLUSH_INTERVAL)

  // 页面隐藏时强制上报一次
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
}

/** 停止采集并清理定时器（应用卸载时调用） */
export function stopPerf(): void {
  window.clearInterval(flushTimer)
  void flush()
  inited = false
}
