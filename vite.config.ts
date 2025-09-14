import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite configuration mirrors the original project. Proxy settings forward
// API requests to the NYTimes endpoints during development. When deploying
// this app statically the proxy is ignored and the client must call the
// appropriate endpoints directly or through a backend proxy.
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