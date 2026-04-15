import React, { Suspense } from "react";
import { BrowserRouter, Route, Routes, Outlet, Navigate } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./components/layout/AppShell";
import { PortalLayout } from "./components/layout/PortalLayout";
import { DriverLayout } from "./pages/driver/DriverLayout";
import { YardLayout } from "./pages/yard/YardLayout";
import { ToastProvider } from "./components/ui/Toast";

// ---------------------------------------------------------------------------
// Inline loading spinner (no extra file needed)
// ---------------------------------------------------------------------------
const LoadingSpinner = () => (
  <div className="flex h-full w-full items-center justify-center min-h-[50vh]">
    <div className="flex flex-col items-center gap-3">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-[#00FFA3] border-t-transparent"
      />
      <span className="text-sm text-zinc-500 font-medium tracking-wide">Loading...</span>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Lazy-loaded page components — default exports
// ---------------------------------------------------------------------------
const OrderList = React.lazy(() => import("./pages/orders/OrderList"));
const OrderDetail = React.lazy(() => import("./pages/orders/OrderDetail"));
const InvoiceList = React.lazy(() => import("./pages/invoices/InvoiceList"));
const InvoiceDetail = React.lazy(() => import("./pages/invoices/InvoiceDetail"));
const DailyTill = React.lazy(() => import("./pages/DailyTill"));
const POSTerminal = React.lazy(() => import("./pages/pos/POSTerminal"));
const VendorList = React.lazy(() => import("./pages/purchasing/VendorList"));
const VendorDetail = React.lazy(() => import("./pages/purchasing/VendorDetail"));
const SavedReports = React.lazy(() => import("./pages/reports/SavedReports"));
const ReportBuilder = React.lazy(() => import("./pages/reports/ReportBuilder"));
const QuoteList = React.lazy(() => import("./pages/quotes/QuoteList"));
const QuoteDetail = React.lazy(() => import("./pages/quotes/QuoteDetail"));
const QuoteAnalytics = React.lazy(() => import("./pages/quotes/QuoteAnalytics"));

// ---------------------------------------------------------------------------
// Lazy-loaded page components — named exports
// ---------------------------------------------------------------------------
const Dashboard = React.lazy(() =>
  import("./pages/Dashboard").then(m => ({ default: m.Dashboard }))
);
const Inventory = React.lazy(() =>
  import("./pages/Inventory").then(m => ({ default: m.Inventory }))
);
const QuoteBuilder = React.lazy(() =>
  import("./pages/QuoteBuilder").then(m => ({ default: m.QuoteBuilder }))
);
const DispatchBoard = React.lazy(() =>
  import("./pages/DispatchBoard").then(m => ({ default: m.DispatchBoard }))
);
const FleetManagement = React.lazy(() =>
  import("./pages/logistics/FleetManagement").then(m => ({ default: m.FleetManagement }))
);
const ProductDetail = React.lazy(() =>
  import("./pages/inventory/ProductDetail").then(m => ({ default: m.ProductDetail }))
);

// Driver pages (named exports)
const RouteList = React.lazy(() =>
  import("./pages/driver/RouteList").then(m => ({ default: m.RouteList }))
);
const StopList = React.lazy(() =>
  import("./pages/driver/StopList").then(m => ({ default: m.StopList }))
);
const DeliveryDetail = React.lazy(() =>
  import("./pages/driver/DeliveryDetail").then(m => ({ default: m.DeliveryDetail }))
);

// Millwork pages (named exports)
const DoorConfigurator = React.lazy(() =>
  import("./pages/millwork/DoorConfigurator").then(m => ({ default: m.DoorConfigurator }))
);
const ProductConfigurator = React.lazy(() =>
  import("./pages/millwork/ProductConfigurator").then(m => ({ default: m.ProductConfigurator }))
);
const BlueprintVerifier = React.lazy(() =>
  import("./pages/millwork/BlueprintVerifier").then(m => ({ default: m.BlueprintVerifier }))
);

// Yard pages (named exports)
const PickQueue = React.lazy(() =>
  import("./pages/yard/PickQueue").then(m => ({ default: m.PickQueue }))
);
const PickDetail = React.lazy(() =>
  import("./pages/yard/PickDetail").then(m => ({ default: m.PickDetail }))
);
const InventoryLookup = React.lazy(() =>
  import("./pages/yard/InventoryLookup").then(m => ({ default: m.InventoryLookup }))
);
const CycleCount = React.lazy(() =>
  import("./pages/yard/CycleCount").then(m => ({ default: m.CycleCount }))
);
const ReceivePO = React.lazy(() =>
  import("./pages/yard/ReceivePO").then(m => ({ default: m.ReceivePO }))
);

// Governance pages (named exports)
const RFCDashboard = React.lazy(() =>
  import("./pages/governance/RFCDashboard").then(m => ({ default: m.RFCDashboard }))
);
const NewRFC = React.lazy(() =>
  import("./pages/governance/NewRFC").then(m => ({ default: m.NewRFC }))
);
const RFCDetail = React.lazy(() =>
  import("./pages/governance/RFCDetail").then(m => ({ default: m.RFCDetail }))
);

// Admin pages (named exports, also have default exports but App.tsx used named)
const TechAdminPage = React.lazy(() =>
  import("./pages/admin/tech_admin/TechAdminPage").then(m => ({ default: m.TechAdminPage }))
);
const PricingMatrix = React.lazy(() =>
  import("./pages/admin/pricing/PricingMatrix").then(m => ({ default: m.PricingMatrix }))
);

// Accounts pages (named exports)
const AccountsPage = React.lazy(() =>
  import("./pages/accounts/AccountsPage").then(m => ({ default: m.AccountsPage }))
);
const AccountDetailPage = React.lazy(() =>
  import("./pages/accounts/AccountDetailPage").then(m => ({ default: m.AccountDetailPage }))
);

// Accounting pages (named exports, also have default exports but App.tsx used named)
const ChartOfAccounts = React.lazy(() =>
  import("./pages/accounting/ChartOfAccounts").then(m => ({ default: m.ChartOfAccounts }))
);
const JournalEntries = React.lazy(() =>
  import("./pages/accounting/JournalEntries").then(m => ({ default: m.JournalEntries }))
);
const TrialBalance = React.lazy(() =>
  import("./pages/accounting/TrialBalance").then(m => ({ default: m.TrialBalance }))
);

// Purchasing pages (named exports)
const PurchaseOrderList = React.lazy(() =>
  import("./pages/purchasing/PurchaseOrderList").then(m => ({ default: m.PurchaseOrderList }))
);
const PurchaseOrderDetail = React.lazy(() =>
  import("./pages/purchasing/PurchaseOrderDetail").then(m => ({ default: m.PurchaseOrderDetail }))
);
const NewPurchaseOrder = React.lazy(() =>
  import("./pages/purchasing/NewPurchaseOrder").then(m => ({ default: m.NewPurchaseOrder }))
);

// Reports pages (named exports)
const ARAgingReportPage = React.lazy(() =>
  import("./pages/reports/ARAgingReport").then(m => ({ default: m.ARAgingReportPage }))
);
const CustomerStatementPage = React.lazy(() =>
  import("./pages/reports/CustomerStatementPage").then(m => ({ default: m.CustomerStatementPage }))
);

// Portal pages (named exports)
const PortalDashboard = React.lazy(() =>
  import("./pages/portal/PortalDashboard").then(m => ({ default: m.PortalDashboard }))
);
const PortalOrders = React.lazy(() =>
  import("./pages/portal/PortalOrders").then(m => ({ default: m.PortalOrders }))
);
const PortalInvoices = React.lazy(() =>
  import("./pages/portal/PortalInvoices").then(m => ({ default: m.PortalInvoices }))
);
const PortalDeliveries = React.lazy(() =>
  import("./pages/portal/PortalDeliveries").then(m => ({ default: m.PortalDeliveries }))
);
const PortalCatalog = React.lazy(() =>
  import("./pages/portal/PortalCatalog").then(m => ({ default: m.PortalCatalog }))
);
const PortalProductDetail = React.lazy(() =>
  import("./pages/portal/PortalProductDetail").then(m => ({ default: m.PortalProductDetail }))
);
const PortalCart = React.lazy(() =>
  import("./pages/portal/PortalCart").then(m => ({ default: m.PortalCart }))
);
const PortalCheckout = React.lazy(() =>
  import("./pages/portal/PortalCheckout").then(m => ({ default: m.PortalCheckout }))
);
const PortalMyAccount = React.lazy(() =>
  import("./pages/portal/PortalMyAccount").then(m => ({ default: m.PortalMyAccount }))
);
const PortalTeam = React.lazy(() =>
  import("./pages/portal/PortalTeam").then(m => ({ default: m.PortalTeam }))
);
const PortalInvite = React.lazy(() =>
  import("./pages/portal/PortalInvite").then(m => ({ default: m.PortalInvite }))
);
const PortalLogin = React.lazy(() => import("./pages/portal/PortalLogin"));

// Project pages (named exports)
const ProjectList = React.lazy(() =>
  import("./pages/projects/ProjectList").then(m => ({ default: m.ProjectList }))
);
const ProjectDashboard = React.lazy(() =>
  import("./pages/projects/ProjectDashboard").then(m => ({ default: m.ProjectDashboard }))
);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* POS Terminal */}
            <Route path="/pos" element={<ErrorBoundary><POSTerminal /></ErrorBoundary>} />

            {/* ERP Desktop */}
            <Route path="/" element={<ErrorBoundary><AppShell><Outlet /></AppShell></ErrorBoundary>}>
              <Route index element={<Dashboard />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="inventory/:id" element={<ProductDetail />} />
              <Route path="quotes" element={<QuoteList />} />
              <Route path="quotes/new" element={<QuoteBuilder />} />
              <Route path="quotes/:id/edit" element={<QuoteBuilder />} />
              <Route path="quotes/analytics" element={<QuoteAnalytics />} />
              <Route path="quotes/:id" element={<QuoteDetail />} />
              <Route path="orders" element={<OrderList />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="invoices" element={<InvoiceList />} />
              <Route path="invoices/:id" element={<InvoiceDetail />} />
              <Route path="reports/daily-till" element={<DailyTill />} />
              <Route path="reports/ar-aging" element={<ARAgingReportPage />} />
              <Route path="reports/customer-statement" element={<CustomerStatementPage />} />
              <Route path="reports/saved" element={<SavedReports />} />
              <Route path="reports/builder" element={<ReportBuilder />} />
              <Route path="dispatch" element={<DispatchBoard />} />
              <Route path="fleet" element={<FleetManagement />} />
              <Route path="millwork/configure" element={<DoorConfigurator />} />
              <Route path="millwork/configurator" element={<ProductConfigurator />} />
              <Route path="millwork/blueprint" element={<BlueprintVerifier />} />
              <Route path="purchasing/vendors" element={<VendorList />} />
              <Route path="purchasing/vendors/:id" element={<VendorDetail />} />
              <Route path="purchasing" element={<PurchaseOrderList />} />
              <Route path="purchasing/new" element={<NewPurchaseOrder />} />
              <Route path="purchasing/:id" element={<PurchaseOrderDetail />} />
              <Route path="sales" element={<Navigate to="/quotes" replace />} />
              <Route path="governance">
                <Route index element={<RFCDashboard />} />
                <Route path="new" element={<NewRFC />} />
                <Route path=":id" element={<RFCDetail />} />
              </Route>
              <Route path="admin" element={<TechAdminPage />} />
              <Route path="pricing" element={<PricingMatrix />} />
              <Route path="accounts">
                <Route index element={<AccountsPage />} />
                <Route path=":id" element={<AccountDetailPage />} />
              </Route>
              <Route path="accounting">
                <Route path="chart-of-accounts" element={<ChartOfAccounts />} />
                <Route path="journal-entries" element={<JournalEntries />} />
                <Route path="trial-balance" element={<TrialBalance />} />
              </Route>
            </Route>

            {/* Mobile Driver App */}
            <Route path="/driver" element={<ErrorBoundary><DriverLayout /></ErrorBoundary>}>
              <Route index element={<RouteList />} />
              <Route path="routes/:id" element={<StopList />} />
              <Route path="deliveries/:id" element={<DeliveryDetail />} />
            </Route>

            {/* Yard Mobile App */}
            <Route path="/yard" element={<ErrorBoundary><YardLayout /></ErrorBoundary>}>
              <Route index element={<PickQueue />} />
              <Route path="pick/:id" element={<PickDetail />} />
              <Route path="inventory" element={<InventoryLookup />} />
              <Route path="count" element={<CycleCount />} />
              <Route path="receiving" element={<ReceivePO />} />
            </Route>

            {/* Portal Login (outside PortalLayout — no sidebar) */}
            <Route path="/portal/login" element={<Suspense fallback={<LoadingSpinner />}><PortalLogin /></Suspense>} />

            {/* Sovereign Dealer Portal (B2B) */}
            <Route path="/portal" element={<ErrorBoundary><PortalLayout /></ErrorBoundary>}>
              <Route index element={<PortalDashboard />} />
              <Route path="orders" element={<PortalOrders />} />
              <Route path="invoices" element={<PortalInvoices />} />
              <Route path="deliveries" element={<PortalDeliveries />} />
              <Route path="catalog" element={<PortalCatalog />} />
              <Route path="catalog/:id" element={<PortalProductDetail />} />
              <Route path="cart" element={<PortalCart />} />
              <Route path="checkout" element={<PortalCheckout />} />
              <Route path="account" element={<PortalMyAccount />} />
              <Route path="team" element={<PortalTeam />} />
              <Route path="team/invite" element={<PortalInvite />} />
              <Route path="projects" element={<ProjectList />} />
              <Route path="projects/:id" element={<ProjectDashboard />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
