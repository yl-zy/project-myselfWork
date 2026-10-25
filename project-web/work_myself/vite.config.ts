import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // 后端 FastAPI：本地 8081
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      // 看板 WebSocket 长连接
      '/ws': {
        target: 'ws://localhost:8081',
        ws: true,
      },
    },
  },
})
