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

/** 首页逻辑：登录态展示 + 模块导航 */
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

  return { userStore, goModule, logout }
}
