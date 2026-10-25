import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import pinia from './store'
import { initPerf } from '@/utils/perf'
import './styles/variables.css'
import './styles/base.css'

// 性能采集：Web Vitals + API 耗时 + 全局错误，批量上报
initPerf()

createApp(App).use(pinia).use(router).mount('#app')
