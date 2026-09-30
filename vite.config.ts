import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8795' } },
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replaceAll('\\', '/')
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(path))
            return 'react'
          if (path.includes('/node_modules/recharts/')) return 'charts'
        },
      },
    },
  },
})
