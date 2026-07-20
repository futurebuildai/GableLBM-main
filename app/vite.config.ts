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
    // Forward /api/* to the backend VERBATIM. The backend mounts every
    // surface under /api (ERP /api/v1, portal /api/portal/v1, partner,
    // integration, a2a) — the historical ROOT_MOUNTED prefix-stripping
    // rewrite here dated from before that unification and silently broke
    // dev for orders/customers/products/me once the backend moved them
    // under /api/v1 (prod was unaffected: no proxy there). Same-origin
    // semantics as App Platform's path routing.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  }
})
