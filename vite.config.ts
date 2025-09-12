import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/nyt': {
        target: 'https://api.nytimes.com',
        changeOrigin: true,
        secure: false,
        rewrite: p => p.replace(/^\/nyt/, '')
      },
      '/nyts': {
        target: 'https://static.nytimes.com',
        changeOrigin: true,
        secure: false,
        rewrite: p => p.replace(/^\/nyts/, '')
      }
    }
  }
})
