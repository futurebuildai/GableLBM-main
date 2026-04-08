import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:9091',
      '/products': 'http://localhost:9091',
      '/customers': 'http://localhost:9091',
      '/vendors': 'http://localhost:9091',
      '/orders': 'http://localhost:9091',
      '/quotes': 'http://localhost:9091',
      '/invoices': 'http://localhost:9091',
      '/locations': 'http://localhost:9091',
      '/health': 'http://localhost:9091',
      '/activities': 'http://localhost:9091',
      '/contacts': 'http://localhost:9091',
      '/documents': 'http://localhost:9091',
      '/gl': 'http://localhost:9091',
      '/parsing': 'http://localhost:9091',
      '/price_levels': 'http://localhost:9091',
      '/pricing': 'http://localhost:9091',
      '/purchase-orders': 'http://localhost:9091',
      '/sales-team': 'http://localhost:9091',
      '/uploads': 'http://localhost:9091'
    }
  }
})
