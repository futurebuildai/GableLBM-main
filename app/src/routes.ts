import type { RouteConfig } from './lib/router.ts';

/**
 * Route table — order matters: more-specific paths must come before less-specific ones.
 */
export const routes: RouteConfig[] = [
  // ── POS (no layout) ─────────────────────────────────────────────
  { path: '/pos', load: () => import('./pages/pos/POSTerminal.ts'), layout: 'none' },

  // ── Portal login (no layout) ────────────────────────────────────
  { path: '/portal/login', load: () => import('./pages/portal/PortalLogin.ts'), layout: 'none' },

  // ── Portal (portal layout) ─────────────────────────────────────
  { path: '/portal/orders', load: () => import('./pages/portal/PortalOrders.ts'), layout: 'portal' },
  { path: '/portal/invoices', load: () => import('./pages/portal/PortalInvoices.ts'), layout: 'portal' },
  { path: '/portal/deliveries', load: () => import('./pages/portal/PortalDeliveries.ts'), layout: 'portal' },
  { path: '/portal/catalog/:id', load: () => import('./pages/portal/PortalProductDetail.ts'), layout: 'portal' },
  { path: '/portal/catalog', load: () => import('./pages/portal/PortalCatalog.ts'), layout: 'portal' },
  { path: '/portal/cart', load: () => import('./pages/portal/PortalCart.ts'), layout: 'portal' },
  { path: '/portal/checkout', load: () => import('./pages/portal/PortalCheckout.ts'), layout: 'portal' },
  { path: '/portal/account', load: () => import('./pages/portal/PortalMyAccount.ts'), layout: 'portal' },
  { path: '/portal/team/invite', load: () => import('./pages/portal/PortalInvite.ts'), layout: 'portal' },
  { path: '/portal/team', load: () => import('./pages/portal/PortalTeam.ts'), layout: 'portal' },
  { path: '/portal/projects/:id', load: () => import('./pages/projects/ProjectDashboard.ts'), layout: 'portal' },
  { path: '/portal/projects', load: () => import('./pages/projects/ProjectList.ts'), layout: 'portal' },
  { path: '/portal', load: () => import('./pages/portal/PortalDashboard.ts'), layout: 'portal' },

  // ── Driver (driver layout) ─────────────────────────────────────
  { path: '/driver/routes/:id', load: () => import('./pages/driver/StopList.ts'), layout: 'driver' },
  { path: '/driver/deliveries/:id', load: () => import('./pages/driver/DeliveryDetail.ts'), layout: 'driver' },
  { path: '/driver', load: () => import('./pages/driver/RouteList.ts'), layout: 'driver' },

  // ── Yard (yard layout) ─────────────────────────────────────────
  { path: '/yard/pick/:id', load: () => import('./pages/yard/PickDetail.ts'), layout: 'yard' },
  { path: '/yard/inventory', load: () => import('./pages/yard/InventoryLookup.ts'), layout: 'yard' },
  { path: '/yard/count', load: () => import('./pages/yard/CycleCount.ts'), layout: 'yard' },
  { path: '/yard/receiving', load: () => import('./pages/yard/ReceivePO.ts'), layout: 'yard' },
  { path: '/yard', load: () => import('./pages/yard/PickQueue.ts'), layout: 'yard' },

  // ── ERP (erp/AppShell layout) ──────────────────────────────────
  { path: '/inventory/:id', load: () => import('./pages/inventory/ProductDetail.ts'), layout: 'erp' },
  { path: '/inventory', load: () => import('./pages/Inventory.ts'), layout: 'erp' },
  { path: '/quotes/new', load: () => import('./pages/QuoteBuilder.ts'), layout: 'erp' },
  { path: '/quotes/:id/edit', load: () => import('./pages/QuoteBuilder.ts'), layout: 'erp' },
  { path: '/quotes/analytics', load: () => import('./pages/quotes/QuoteAnalytics.ts'), layout: 'erp' },
  { path: '/quotes/:id', load: () => import('./pages/quotes/QuoteDetail.ts'), layout: 'erp' },
  { path: '/quotes', load: () => import('./pages/quotes/QuoteList.ts'), layout: 'erp' },
  { path: '/orders/:id', load: () => import('./pages/orders/OrderDetail.ts'), layout: 'erp' },
  { path: '/orders', load: () => import('./pages/orders/OrderList.ts'), layout: 'erp' },
  { path: '/invoices/:id', load: () => import('./pages/invoices/InvoiceDetail.ts'), layout: 'erp' },
  { path: '/invoices', load: () => import('./pages/invoices/InvoiceList.ts'), layout: 'erp' },
  { path: '/reports/daily-till', load: () => import('./pages/DailyTill.ts'), layout: 'erp' },
  { path: '/reports/ar-aging', load: () => import('./pages/reports/ARAgingReport.ts'), layout: 'erp' },
  { path: '/reports/customer-statement', load: () => import('./pages/reports/CustomerStatementPage.ts'), layout: 'erp' },
  { path: '/reports/saved', load: () => import('./pages/reports/SavedReports.ts'), layout: 'erp' },
  { path: '/reports/builder', load: () => import('./pages/reports/ReportBuilder.ts'), layout: 'erp' },
  { path: '/dispatch', load: () => import('./pages/DispatchBoard.ts'), layout: 'erp' },
  { path: '/fleet', load: () => import('./pages/logistics/FleetManagement.ts'), layout: 'erp' },
  { path: '/millwork/configure', load: () => import('./pages/millwork/DoorConfigurator.ts'), layout: 'erp' },
  { path: '/millwork/configurator', load: () => import('./pages/millwork/ProductConfigurator.ts'), layout: 'erp' },
  { path: '/millwork/blueprint', load: () => import('./pages/millwork/BlueprintVerifier.ts'), layout: 'erp' },
  { path: '/purchasing/vendors/:id', load: () => import('./pages/purchasing/VendorDetail.ts'), layout: 'erp' },
  { path: '/purchasing/vendors', load: () => import('./pages/purchasing/VendorList.ts'), layout: 'erp' },
  { path: '/purchasing/new', load: () => import('./pages/purchasing/NewPurchaseOrder.ts'), layout: 'erp' },
  { path: '/purchasing/:id', load: () => import('./pages/purchasing/PurchaseOrderDetail.ts'), layout: 'erp' },
  { path: '/purchasing', load: () => import('./pages/purchasing/PurchaseOrderList.ts'), layout: 'erp' },
  { path: '/sales', load: async () => {}, layout: 'erp', redirect: '/quotes' },
  { path: '/governance/new', load: () => import('./pages/governance/NewRFC.ts'), layout: 'erp' },
  { path: '/governance/:id', load: () => import('./pages/governance/RFCDetail.ts'), layout: 'erp' },
  { path: '/governance', load: () => import('./pages/governance/RFCDashboard.ts'), layout: 'erp' },
  { path: '/admin/branches/:id/users', load: () => import('./pages/admin/branches/BranchUsers.ts'), layout: 'erp' },
  { path: '/admin/branches', load: () => import('./pages/admin/branches/Branches.ts'), layout: 'erp' },
  { path: '/admin', load: () => import('./pages/admin/tech_admin/TechAdminPage.ts'), layout: 'erp' },
  { path: '/pricing', load: () => import('./pages/admin/pricing/PricingMatrix.ts'), layout: 'erp' },
  { path: '/accounts/:id', load: () => import('./pages/accounts/AccountDetailPage.ts'), layout: 'erp' },
  { path: '/accounts', load: () => import('./pages/accounts/AccountsPage.ts'), layout: 'erp' },
  { path: '/accounting/chart-of-accounts', load: () => import('./pages/accounting/ChartOfAccounts.ts'), layout: 'erp' },
  { path: '/accounting/journal-entries', load: () => import('./pages/accounting/JournalEntries.ts'), layout: 'erp' },
  { path: '/accounting/trial-balance', load: () => import('./pages/accounting/TrialBalance.ts'), layout: 'erp' },
  // Always-available ERP dashboard (linked from the local-dev surface picker).
  { path: '/dashboard', load: () => import('./pages/Dashboard.ts'), layout: 'erp' },
  // Surface picker — mounted at `/` for:
  //   - local dev (`vite dev`)                          → import.meta.env.DEV
  //   - the public demo build (demo.gablelbm.com)        → VITE_DEMO_MODE=true
  // Staging and master keep `/` on the ERP dashboard.
  ...(import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true'
    ? [
        { path: '/local-test', load: () => import('./pages/LocalTestHub.ts'), layout: 'none' as const },
        { path: '/', load: () => import('./pages/LocalTestHub.ts'), layout: 'none' as const },
      ]
    : [
        { path: '/', load: () => import('./pages/Dashboard.ts'), layout: 'erp' as const },
      ]),
];
