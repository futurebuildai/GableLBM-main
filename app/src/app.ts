import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { router, type RouteMatch } from './lib/router.ts';

// Import layout shells (eagerly — they're small and always needed)
import './components/layout/app-shell.ts';
import './components/layout/portal-layout.ts';
import './components/layout/driver-layout.ts';
import './components/layout/yard-layout.ts';

// Import toast container (global)
import './components/ui/toast-container.ts';

// Import not-found page (fallback for unknown routes)
import './components/ui/not-found.ts';

@customElement('gable-app')
export class GableApp extends LitElement {
  // Light DOM so Tailwind works
  createRenderRoot() { return this; }

  @state() private _match: RouteMatch | null = null;
  @state() private _loading = true;

  connectedCallback() {
    super.connectedCallback();
    router.addEventListener('route-changed', this._onRouteChanged);
    // Initial route
    if (router.currentMatch) {
      this._onRouteChanged(
        new CustomEvent('route-changed', { detail: router.currentMatch })
      );
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    router.removeEventListener('route-changed', this._onRouteChanged);
  }

  private _onRouteChanged = async (e: Event) => {
    const match = (e as CustomEvent<RouteMatch | null>).detail;
    this._match = match;

    if (!match) {
      this._loading = false;
      return;
    }

    this._loading = true;

    try {
      // Lazy-load the page module (which self-registers as a custom element)
      await match.route.load();
      this._loading = false;
    } catch (err) {
      console.error('Failed to load route:', err);
      this._loading = false;
    }
  };

  /** Derive the custom element tag from the route's import path */
  private _getPageTag(): string {
    if (!this._match) return '';
    // Extract filename from the load function's toString or use a convention
    // The route's path determines the page tag
    const path = this._match.route.path;

    // Map routes to custom element tags via a naming convention
    // e.g. '/' → 'gable-dashboard', '/orders' → 'gable-order-list'
    return this._pathToTag(path);
  }

  private _pathToTag(path: string): string {
    const tagMap: Record<string, string> = {
      '/': import.meta.env.DEV ? 'gable-local-test-hub' : 'gable-dashboard',
      '/local-test': 'gable-local-test-hub',
      '/dashboard': 'gable-dashboard',
      '/pos': 'gable-pos-terminal',
      '/inventory': 'gable-inventory',
      '/inventory/:id': 'gable-product-detail',
      '/quotes': 'gable-quote-list',
      '/quotes/new': 'gable-quote-builder',
      '/quotes/:id/edit': 'gable-quote-builder',
      '/quotes/analytics': 'gable-quote-analytics',
      '/quotes/:id': 'gable-quote-detail',
      '/orders': 'gable-order-list',
      '/orders/:id': 'gable-order-detail',
      '/invoices': 'gable-invoice-list',
      '/invoices/:id': 'gable-invoice-detail',
      '/reports/daily-till': 'gable-daily-till',
      '/reports/ar-aging': 'gable-ar-aging-report',
      '/reports/customer-statement': 'gable-customer-statement',
      '/reports/saved': 'gable-saved-reports',
      '/reports/builder': 'gable-report-builder',
      '/dispatch': 'gable-dispatch-board',
      '/fleet': 'gable-fleet-management',
      '/millwork/configure': 'gable-door-configurator',
      '/millwork/configurator': 'gable-product-configurator',
      '/millwork/blueprint': 'gable-blueprint-verifier',
      '/purchasing/vendors/:id': 'gable-vendor-detail',
      '/purchasing/vendors': 'gable-vendor-list',
      '/purchasing/new': 'gable-new-purchase-order',
      '/purchasing/:id': 'gable-purchase-order-detail',
      '/purchasing': 'gable-purchase-order-list',
      '/governance': 'gable-rfc-dashboard',
      '/governance/new': 'gable-new-rfc',
      '/governance/:id': 'gable-rfc-detail',
      '/admin': 'gable-tech-admin',
      '/admin/branches': 'gable-admin-branches',
      '/admin/branches/:id/users': 'gable-admin-branch-users',
      '/pricing': 'gable-pricing-matrix',
      '/accounts': 'gable-accounts-page',
      '/accounts/:id': 'gable-account-detail',
      '/accounting/chart-of-accounts': 'gable-chart-of-accounts',
      '/accounting/journal-entries': 'gable-journal-entries',
      '/accounting/trial-balance': 'gable-trial-balance',
      '/portal/login': 'gable-portal-login',
      '/portal': 'gable-portal-dashboard',
      '/portal/orders': 'gable-portal-orders',
      '/portal/invoices': 'gable-portal-invoices',
      '/portal/deliveries': 'gable-portal-deliveries',
      '/portal/catalog': 'gable-portal-catalog',
      '/portal/catalog/:id': 'gable-portal-product-detail',
      '/portal/cart': 'gable-portal-cart',
      '/portal/checkout': 'gable-portal-checkout',
      '/portal/account': 'gable-portal-my-account',
      '/portal/team': 'gable-portal-team',
      '/portal/team/invite': 'gable-portal-invite',
      '/portal/projects': 'gable-project-list',
      '/portal/projects/:id': 'gable-project-dashboard',
      '/driver': 'gable-driver-route-list',
      '/driver/routes/:id': 'gable-stop-list',
      '/driver/deliveries/:id': 'gable-delivery-detail',
      '/yard': 'gable-pick-queue',
      '/yard/pick/:id': 'gable-pick-detail',
      '/yard/inventory': 'gable-yard-inventory-lookup',
      '/yard/count': 'gable-cycle-count',
      '/yard/receiving': 'gable-receive-po',
    };

    return tagMap[path] || 'gable-not-found';
  }

  render() {
    if (this._loading) {
      return html`
        <div class="flex h-screen w-full items-center justify-center bg-deep-space">
          <div class="flex flex-col items-center gap-3">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-gable-green border-t-transparent"></div>
            <span class="text-sm text-zinc-500 font-medium tracking-wide">Loading...</span>
          </div>
        </div>
      `;
    }

    if (!this._match) {
      return html`
        <div class="flex h-screen w-full items-center justify-center bg-deep-space text-white">
          <div class="text-center">
            <h1 class="text-4xl font-bold font-mono mb-2">404</h1>
            <p class="text-zinc-400">Page not found</p>
            <a href="/" class="text-gable-green hover:underline mt-4 inline-block">Go to Dashboard</a>
          </div>
        </div>
      `;
    }

    const tag = this._getPageTag();
    const layout = this._match.route.layout;

    // Create the page element dynamically with params as attributes
    const pageHtml = this._renderPageTag(tag);

    switch (layout) {
      case 'erp':
        return html`<gable-app-shell .pageContent=${pageHtml}></gable-app-shell><gable-toast-container></gable-toast-container>`;
      case 'portal':
        return html`<gable-portal-layout .pageContent=${pageHtml}></gable-portal-layout><gable-toast-container></gable-toast-container>`;
      case 'driver':
        return html`<gable-driver-layout .pageContent=${pageHtml}></gable-driver-layout><gable-toast-container></gable-toast-container>`;
      case 'yard':
        return html`<gable-yard-layout .pageContent=${pageHtml}></gable-yard-layout><gable-toast-container></gable-toast-container>`;
      case 'none':
      default:
        return html`${pageHtml}<gable-toast-container></gable-toast-container>`;
    }
  }

  /** Render a custom element tag with route params as attributes */
  private _renderPageTag(tag: string) {
    const params = this._match?.params || {};
    const el = document.createElement(tag);
    // Pass route params as attributes
    for (const [key, value] of Object.entries(params)) {
      el.setAttribute(`route-${key}`, value);
    }
    return html`${el}`;
  }
}
