import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // В разработке запросы к API уходят на локальный сервер, поэтому CORS не нужен
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
    },
  },
})
