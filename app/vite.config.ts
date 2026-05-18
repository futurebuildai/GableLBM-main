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
      // routes like /dashboard, /portal, /driver, /yard, /pos don't collide
      // with backend root-mounted endpoints of the same name.
      // /api/v1/{rest} is rewritten to /{rest} because the backend mounts
      // most domain routes at the root despite the /api/v1 convention.
      // /api/portal, /api/integration, /api/v1/a2a, /api/tax, /api/pos,
      // /api/configurator are left as-is (the backend mounts them with that
      // prefix).
      // Backend mounts SOME modules at root (e.g. /orders, /branches, /me)
      // and others under /api/v1/* (e.g. /api/v1/dashboard, /api/v1/delivery,
      // /api/v1/edi, /api/v1/pricing). The frontend always calls /api/v1/*;
      // we strip the prefix only for modules that live at the root.
      const ROOT_MOUNTED = new Set([
        'orders', 'quotes', 'invoices', 'customers', 'products', 'vendors',
        'purchase-orders', 'branches', 'locations', 'me', 'users',
        'activities', 'contacts', 'documents', 'gl', 'parsing',
        'price_levels', 'sales-team', 'health',
      ]);
      return {
        '/api': {
          target,
          changeOrigin: false,
          rewrite: (path: string) => {
            // Pass-through prefixes the backend mounts as-is.
            if (
              path.startsWith('/api/portal/') ||
              path.startsWith('/api/integration/') ||
              path.startsWith('/api/v1/a2a/') ||
              path.startsWith('/api/tax/') ||
              path.startsWith('/api/pos/') ||
              path.startsWith('/api/configurator/') ||
              path.startsWith('/api/admin/') ||
              path.startsWith('/api/ap/') ||
              path.startsWith('/api/bankrecon/') ||
              path.startsWith('/api/documents/') ||
              path.startsWith('/api/matching/') ||
              path.startsWith('/api/millwork/') ||
              path.startsWith('/api/partner/') ||
              path.startsWith('/api/reporting/') ||
              path.startsWith('/api/reports/') ||
              path.startsWith('/api/accounts/') ||
              path.startsWith('/api/invoices/')
            ) {
              return path;
            }
            if (path.startsWith('/api/v1/')) {
              const after = path.slice('/api/v1/'.length);
              const firstSeg = after.split('/')[0].split('?')[0];
              if (ROOT_MOUNTED.has(firstSeg)) {
                return path.replace(/^\/api\/v1/, '');
              }
              // Everything else under /api/v1 the backend mounts with the
              // /api/v1 prefix (dashboard, delivery, edi, pricing, etc).
              return path;
            }
            return path;
          },
        },
      };
    })(),
  }
})
