import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Core React runtime
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
              return 'vendor-react';
            }
            // Routing
            if (id.includes('/react-router')) {
              return 'vendor-router';
            }
            // Animation
            if (id.includes('/framer-motion/')) {
              return 'vendor-framer';
            }
            // Charts
            if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-vendor/')) {
              return 'vendor-recharts';
            }
            // Icons
            if (id.includes('/lucide-react/')) {
              return 'vendor-icons';
            }
            // Maps
            if (id.includes('/leaflet/') || id.includes('/react-leaflet/')) {
              return 'vendor-leaflet';
            }
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/products': 'http://localhost:8080',
      '/customers': 'http://localhost:8080',
      '/vendors': 'http://localhost:8080',
      '/orders': 'http://localhost:8080',
      '/quotes': 'http://localhost:8080',
      '/invoices': 'http://localhost:8080',
      '/locations': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
      '/activities': 'http://localhost:8080',
      '/contacts': 'http://localhost:8080',
      '/documents': 'http://localhost:8080',
      '/gl': 'http://localhost:8080',
      '/parsing': 'http://localhost:8080',
      '/price_levels': 'http://localhost:8080',
      '/pricing': 'http://localhost:8080',
      '/purchase-orders': 'http://localhost:8080',
      '/sales-team': 'http://localhost:8080',
      '/uploads': 'http://localhost:8080'
    }
  }
})
