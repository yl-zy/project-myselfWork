import { createRouter, createWebHistory } from 'vue-router'
import { setCurrentPage } from '@/utils/perf'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/home/HomeView.vue'),
      meta: { title: '首页' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/login/LoginView.vue'),
      meta: { title: '登录' },
    },
    // 5 个功能模块：逐页开发，未完成的先挂占位页
    {
      path: '/migration',
      name: 'migration',
      component: () => import('@/views/migration/MigrationView.vue'),
      meta: { title: '人口流动大屏' },
    },
    {
      path: '/drone',
      name: 'drone',
      component: () => import('@/views/drone/DroneView.vue'),
      meta: { title: '物流无人机机队监控' },
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('@/views/chat/ChatView.vue'),
      meta: { title: '知识库问答' },
    },
    {
      path: '/kanban',
      name: 'kanban',
      component: () => import('@/views/kanban/KanbanView.vue'),
      meta: { title: '实时协作看板' },
    },
    {
      path: '/perf',
      name: 'perf',
      component: () => import('@/views/perf/PerfView.vue'),
      meta: { title: '性能监控平台' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · 个人作品集` : '个人作品集'
  setCurrentPage(to.path)
})

/**
 * 路由预取：首页加载后浏览器空闲时提前下载最重的两个 chunk（无人机 4MB + 人口流动 300KB），
 * 用户点击时 chunk 已在缓存，实现"秒进"。
 * 不执行组件逻辑，仅触发 chunk 下载到 HTTP 缓存。
 */
let prefetched = false
function schedulePrefetch(): void {
  if (prefetched) return
  prefetched = true
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback
  const run = () => {
    void import('@/views/drone/DroneView.vue').catch(() => {})
    void import('@/views/migration/MigrationView.vue').catch(() => {})
  }
  if (idle) idle(run)
  else window.setTimeout(run, 1500)
}
router.afterEach((to) => {
  if (to.path === '/') schedulePrefetch()
})

export default router
