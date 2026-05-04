import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // listen on all network interfaces so ngrok can reach the dev server
    host: true,
    port: 5173,
    // allow common ngrok host suffixes so dynamic ngrok subdomains are accepted
    // this covers *.ngrok-free.app and *.ngrok.io hosts
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok.app'],
    // Proxy common backend API routes so the dev server (and ngrok) forwards them to backend.
    // Set BACKEND_PORT env var to override (e.g., 3007). Defaults to 3000.
    proxy: (() => {
      const backendPort = process.env.BACKEND_PORT || '3000'
      const target = `http://localhost:${backendPort}`
      const apiPrefixes = [
        '/auth',
        '/products',
        '/reviews',
        '/cart',
        '/orders',
        '/users',
        '/catalog',
        '/admin',
        '/chat',
        '/images',
        '/health',
      ]
      const proxy: Record<string, any> = {}
      for (const prefix of apiPrefixes) {
        proxy[prefix] = { target, changeOrigin: true }
      }
      // Keep legacy /api proxy for code that uses /api/... paths
      proxy['/api'] = { target, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api/, '') }
      return proxy
    })(),
  },
})
