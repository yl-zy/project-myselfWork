import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
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
      component: () => import('@/components/ComingSoon.vue'),
      meta: { title: '人口流动大屏' },
    },
    {
      path: '/drone',
      name: 'drone',
      component: () => import('@/components/ComingSoon.vue'),
      meta: { title: '无人机三维巡检' },
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('@/components/ComingSoon.vue'),
      meta: { title: '知识库问答' },
    },
    {
      path: '/kanban',
      name: 'kanban',
      component: () => import('@/components/ComingSoon.vue'),
      meta: { title: '实时协作看板' },
    },
    {
      path: '/perf',
      name: 'perf',
      component: () => import('@/components/ComingSoon.vue'),
      meta: { title: '性能监控平台' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · 个人作品集` : '个人作品集'
})

export default router
