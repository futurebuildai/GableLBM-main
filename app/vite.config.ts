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
    proxy: (() => {
      const target = process.env.VITE_API_PROXY || 'http://localhost:8080';
      // Only proxy /api/* — let vite serve everything else as SPA so client
      // routes like /dashboard, /portal, /driver, /yard, /pos don't collide.
      // Simply pass through all /api requests directly to target (which mounts them with /api/v1 prefix)
      return {
        '/api': {
          target,
          changeOrigin: false,
          rewrite: (path: string) => path,
        },
      };
    })(),
  }
})
