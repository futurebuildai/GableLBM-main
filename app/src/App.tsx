import { BrowserRouter, Route, Routes, Outlet, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";

import { Dashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { QuoteBuilder } from "./pages/QuoteBuilder";
import OrderList from "./pages/orders/OrderList";
import OrderDetail from "./pages/orders/OrderDetail";
import InvoiceList from "./pages/invoices/InvoiceList";
import InvoiceDetail from "./pages/invoices/InvoiceDetail";
import DailyTill from "./pages/DailyTill";
import { DispatchBoard } from "./pages/DispatchBoard";
import { DriverLayout } from "./pages/driver/DriverLayout";
import { RouteList } from "./pages/driver/RouteList";
import { StopList } from "./pages/driver/StopList";
import { DeliveryDetail } from "./pages/driver/DeliveryDetail";
import { DoorConfigurator } from "./pages/millwork/DoorConfigurator";
import { ProductConfigurator } from "./pages/millwork/ProductConfigurator";
import { BlueprintVerifier } from "./pages/millwork/BlueprintVerifier";
import { YardLayout } from "./pages/yard/YardLayout";
import { PickQueue } from "./pages/yard/PickQueue";
import { PickDetail } from "./pages/yard/PickDetail";
import { InventoryLookup } from "./pages/yard/InventoryLookup";
import { CycleCount } from "./pages/yard/CycleCount";
import { ReceivePO } from "./pages/yard/ReceivePO";

import { RFCDashboard } from "./pages/governance/RFCDashboard";
import { NewRFC } from "./pages/governance/NewRFC";
import { RFCDetail } from "./pages/governance/RFCDetail";
import { TechAdminPage } from "./pages/admin/tech_admin/TechAdminPage";
import { PricingMatrix } from "./pages/admin/pricing/PricingMatrix";
import { AccountsPage } from "./pages/accounts/AccountsPage";
import { AccountDetailPage } from "./pages/accounts/AccountDetailPage";
import QuoteList from "./pages/quotes/QuoteList";
import QuoteDetail from "./pages/quotes/QuoteDetail";
import QuoteAnalytics from "./pages/quotes/QuoteAnalytics";
import { PurchaseOrderList } from "./pages/purchasing/PurchaseOrderList";
import { PurchaseOrderDetail } from "./pages/purchasing/PurchaseOrderDetail";
import { NewPurchaseOrder } from "./pages/purchasing/NewPurchaseOrder";
import VendorList from "./pages/purchasing/VendorList";
import VendorDetail from "./pages/purchasing/VendorDetail";
import { ARAgingReportPage } from "./pages/reports/ARAgingReport";
import { CustomerStatementPage } from "./pages/reports/CustomerStatementPage";
import SavedReports from "./pages/reports/SavedReports";
import ReportBuilder from "./pages/reports/ReportBuilder";
import { ChartOfAccounts } from "./pages/accounting/ChartOfAccounts";
import { JournalEntries } from "./pages/accounting/JournalEntries";
import { TrialBalance } from "./pages/accounting/TrialBalance";
import { PortalLayout } from "./components/layout/PortalLayout";
import { PortalDashboard } from "./pages/portal/PortalDashboard";
import { PortalOrders } from "./pages/portal/PortalOrders";
import { PortalInvoices } from "./pages/portal/PortalInvoices";
import { PortalDeliveries } from "./pages/portal/PortalDeliveries";
import { PortalCatalog } from "./pages/portal/PortalCatalog";
import { PortalProductDetail } from "./pages/portal/PortalProductDetail";
import { PortalCart } from "./pages/portal/PortalCart";
import { PortalCheckout } from "./pages/portal/PortalCheckout";
import { PortalMyAccount } from "./pages/portal/PortalMyAccount";
import { PortalTeam } from "./pages/portal/PortalTeam";
import { PortalInvite } from "./pages/portal/PortalInvite";
import { ProjectList } from "./pages/projects/ProjectList";
import { ProjectDashboard } from "./pages/projects/ProjectDashboard";
import POSTerminal from "./pages/pos/POSTerminal";
import { ProductDetail } from "./pages/inventory/ProductDetail";
import { FleetManagement } from "./pages/logistics/FleetManagement";
import { DemoLanding } from "./pages/DemoLanding";

import { ToastProvider } from "./components/ui/Toast";

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Demo Landing */}
          <Route path="/" element={<DemoLanding />} />

          {/* POS Terminal */}
          <Route path="/pos" element={<POSTerminal />} />

          {/* ERP Desktop (moved from / to /erp) */}
          <Route path="/erp" element={<AppShell><Outlet /></AppShell>}>
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
            <Route path="sales" element={<Navigate to="/erp/quotes" replace />} />
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
          <Route path="/driver" element={<DriverLayout />}>
            <Route index element={<RouteList />} />
            <Route path="routes/:id" element={<StopList />} />
            <Route path="deliveries/:id" element={<DeliveryDetail />} />
          </Route>

          {/* Yard Mobile App */}
          <Route path="/yard" element={<YardLayout />}>
            <Route index element={<PickQueue />} />
            <Route path="pick/:id" element={<PickDetail />} />
            <Route path="inventory" element={<InventoryLookup />} />
            <Route path="count" element={<CycleCount />} />
            <Route path="receiving" element={<ReceivePO />} />
          </Route>

          {/* Sovereign Dealer Portal (B2B) */}
          <Route path="/portal" element={<PortalLayout />}>
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
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
