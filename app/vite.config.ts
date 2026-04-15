import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Lit runtime
            if (id.includes('/lit/') || id.includes('/@lit/') || id.includes('/lit-html/') || id.includes('/@lit/reactive-element/')) {
              return 'vendor-lit';
            }
            // Charts
            if (id.includes('/chart.js/')) {
              return 'vendor-chartjs';
            }
            // Icons
            if (id.includes('/lucide/')) {
              return 'vendor-icons';
            }
            // Maps
            if (id.includes('/leaflet/')) {
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
