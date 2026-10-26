import {
  onBeforeUnmount,
  onMounted,
  type ComponentPublicInstance,
  type CSSProperties,
} from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import { toast } from '@/utils/toast'

export interface ModuleCard {
  key: 'migration' | 'drone' | 'chat' | 'kanban' | 'perf'
  path: string
  title: string
  subtitle: string
  desc: string
  tags: string[]
}

/** 5 个演示模块的导航卡片数据 */
export const moduleCards: ModuleCard[] = [
  {
    key: 'migration',
    path: '/migration',
    title: '人口流动大屏',
    subtitle: 'MIGRATION MAP',
    desc: 'OpenLayers 全国人口迁徙可视化，模拟数据 30 秒一批滚动刷新，支持省级下钻',
    tags: ['OpenLayers', 'ECharts', '大屏适配'],
  },
  {
    key: 'drone',
    path: '/drone',
    title: '物流无人机机队',
    subtitle: 'UAV FLEET',
    desc: 'Cesium 南京城区三维场景，200 架物流无人机实时模拟：状态机推演、2 秒快照刷新、点选查看单机航线与遥测',
    tags: ['Cesium', '三维可视化', '实时刷新'],
  },
  {
    key: 'chat',
    path: '/chat',
    title: '知识库问答',
    subtitle: 'RAG CHAT',
    desc: '自建检索增强问答，SSE 流式输出，多会话管理与限流持久化',
    tags: ['SSE', 'RAG', '流式渲染'],
  },
  {
    key: 'kanban',
    path: '/kanban',
    title: '实时协作看板',
    subtitle: 'LIVE BOARD',
    desc: 'WebSocket 多人实时同步，乐观锁冲突处理与在线成员感知',
    tags: ['WebSocket', '多人协作', '乐观锁'],
  },
  {
    key: 'perf',
    path: '/perf',
    title: '性能监控平台',
    subtitle: 'PERF DASHBOARD',
    desc: 'Web Vitals 采集上报，P75 聚合、错误追踪与趋势仪表盘',
    tags: ['Web Vitals', '聚合分析', '自监控'],
  },
]

/** 平台数据总览（模拟常量，纯前端展示，不接后端） */
export interface PlatformStat {
  value: number
  suffix: string
  label: string
  tone: string
}

export const platformStats: PlatformStat[] = [
  { value: 5, suffix: '', label: '功能演示模块', tone: '#22d3ee' },
  { value: 200, suffix: '+', label: '并发无人机实时模拟', tone: '#818cf8' },
  { value: 23, suffix: '+', label: '知识库检索语料', tone: '#34d399' },
  { value: 8, suffix: 'ms', label: 'WebSocket 实时同步延迟', tone: '#f87171' },
]

/** 首页逻辑：登录态展示 + 模块导航 + 入场/计数/磁吸动效 */
export function useHome() {
  const router = useRouter()
  const userStore = useUserStore()

  function goModule(path: string): void {
    router.push(path)
  }

  function logout(): void {
    userStore.logout()
    toast.info('已退出登录')
  }

  /* ---- scroll-reveal：进入视口挂 is-visible ---- */
  const revealEls: Element[] = []
  let revealObserver: IntersectionObserver | null = null

  function observe(el: Element | ComponentPublicInstance | null): void {
    if (el instanceof Element && !revealEls.includes(el)) revealEls.push(el)
  }

  /* ---- 数字 count-up（requestAnimationFrame + easeOut） ---- */
  const statEls: HTMLElement[] = []
  let statObserver: IntersectionObserver | null = null

  function bindStat(el: Element | ComponentPublicInstance | null): void {
    if (el instanceof HTMLElement && !statEls.includes(el)) statEls.push(el)
  }

  function runCount(el: HTMLElement): void {
    const target = Number(el.dataset.count ?? 0)
    const duration = Number(el.dataset.dur ?? 800)
    const delay = Number(el.dataset.delay ?? 0)
    const startAt = performance.now() + delay

    function tick(now: number): void {
      if (now < startAt) {
        requestAnimationFrame(tick)
        return
      }
      const p = Math.min((now - startAt) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      el.textContent = String(Math.round(target * eased))
      if (p < 1) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }

  /* ---- 卡片磁吸光效：跟随鼠标的 --mx/--my ---- */
  function handleCardMove(e: MouseEvent): void {
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
    el.style.setProperty('--my', `${e.clientY - rect.top}px`)
  }

  function handleCardLeave(e: MouseEvent): void {
    const el = e.currentTarget as HTMLElement
    el.style.setProperty('--mx', '50%')
    el.style.setProperty('--my', '50%')
  }

  /* ---- 卡片入场 stagger 的延迟变量 ---- */
  function revealDelayStyle(i: number): CSSProperties {
    return { '--rd': `${i * 90}ms` } as CSSProperties
  }

  onMounted(() => {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add('is-visible')
            revealObserver?.unobserve(en.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    revealEls.forEach((el) => revealObserver?.observe(el))

    statObserver = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            runCount(en.target as HTMLElement)
            statObserver?.unobserve(en.target)
          }
        }
      },
      { threshold: 0.4 },
    )
    statEls.forEach((el) => statObserver?.observe(el))
  })

  onBeforeUnmount(() => {
    revealObserver?.disconnect()
    statObserver?.disconnect()
  })

  return {
    userStore,
    goModule,
    logout,
    platformStats,
    observe,
    bindStat,
    handleCardMove,
    handleCardLeave,
    revealDelayStyle,
  }
}