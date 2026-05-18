import { LitElement, html, nothing } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { cn } from '../../lib/utils.ts';
import { router } from '../../lib/router.ts';
import '../ui/brand-logo.ts';
import '../ui/omnibar.ts';
import '../ui/shortcuts-modal.ts';
import './branch-switcher.ts';
import { icon } from '../../lib/icons.ts';
import {
  LayoutDashboard, LayoutGrid, Package, Truck, FileText,
  Settings, Menu, Hammer, ChevronLeft, ChevronRight, Search,
  ShoppingBag, Store, BookOpen, Building2
} from 'lucide';

@customElement('gable-app-shell')
export class GableAppShell extends LitElement {
  createRenderRoot() { return this; }

  @property({ attribute: false }) pageContent: unknown = nothing;

  @state() private _sidebarOpen = true;
  @state() private _shortcutsOpen = false;
  @state() private _isOffline = !navigator.onLine;

  private _boundKeyDown = this._handleKeyDown.bind(this);
  private _boundOnline = () => { this._isOffline = false; };
  private _boundOffline = () => { this._isOffline = true; };
  private _boundRouteChanged = () => { this.requestUpdate(); };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('online', this._boundOnline);
    window.addEventListener('offline', this._boundOffline);
    router.addEventListener('route-changed', this._boundRouteChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('online', this._boundOnline);
    window.removeEventListener('offline', this._boundOffline);
    router.removeEventListener('route-changed', this._boundRouteChanged);
  }

  private _handleKeyDown(e: KeyboardEvent) {
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
      e.preventDefault();
      this._shortcutsOpen = true;
    }
  }

  private _navItem(to: string, iconData: Parameters<typeof icon>[0], label: string) {
    const path = router.currentPath;
    const active = to === '/' ? path === '/' : path.startsWith(to);

    return html`
      <a href="${to}" class="${cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium group relative overflow-hidden',
        active
          ? 'text-gable-green bg-gable-green/10 shadow-[inset_0_0_0_1px_rgba(0,255,163,0.2)]'
          : 'text-zinc-400 hover:text-white hover:bg-white/5'
      )}">
        ${active ? html`<div class="absolute left-0 top-2 bottom-2 w-1 bg-gable-green rounded-r-full"></div>` : nothing}
        <span class="${cn('transition-colors relative z-10', active ? 'text-gable-green' : 'group-hover:text-white')}">
          ${icon(iconData, 20)}
        </span>
        ${this._sidebarOpen ? html`<span class="whitespace-nowrap relative z-10">${label}</span>` : nothing}
        ${!active ? html`<div class="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>` : nothing}
      </a>
    `;
  }

  render() {
    return html`
      <div class="min-h-screen bg-deep-space text-foreground flex overflow-hidden font-sans selection:bg-gable-green/30">
        <!-- Skip Navigation -->
        <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-[#00FFA3] focus:text-[#0A0B10] focus:rounded">
          Skip to main content
        </a>

        <!-- Sidebar -->
        <aside
          class="bg-slate-steel border-r border-white/5 flex flex-col fixed inset-y-0 left-0 z-50 shadow-elevation-2 transition-all duration-300"
          style="width: ${this._sidebarOpen ? 280 : 80}px"
        >
          <!-- Logo -->
          <div class="h-16 flex items-center px-4 border-b border-white/5 relative bg-deep-space/20">
            <div class="flex-1 flex items-center gap-3 overflow-hidden">
              <div class="h-10 w-10 flex items-center justify-center shrink-0">
                <gable-brand-logo variant="mark" size="md" class-name="text-white drop-shadow-glow"></gable-brand-logo>
              </div>
              ${this._sidebarOpen ? html`<gable-brand-logo variant="text" size="md"></gable-brand-logo>` : nothing}
            </div>
          </div>

          <!-- Navigation -->
          <nav aria-label="Main navigation" class="flex-1 p-3 space-y-1 overflow-y-auto no-scrollbar">
            <div class="mb-6">
              ${this._navItem('/dashboard', LayoutDashboard, 'Dashboard')}
              ${this._navItem('/inventory', Package, 'Inventory')}
              ${this._navItem('/accounts', LayoutDashboard, 'Accounts')}
            </div>

            <div class="mb-2 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              ${this._sidebarOpen ? 'Operations' : nothing}
            </div>

            ${this._navItem('/quotes', FileText, 'Quotes')}
            ${this._navItem('/orders', FileText, 'Orders')}
            ${this._navItem('/purchasing', ShoppingBag, 'Purchasing')}
            ${this._navItem('/purchasing/vendors', Store, 'Vendors')}
            ${this._navItem('/invoices', FileText, 'Invoices')}
            ${this._navItem('/millwork/configurator', Hammer, 'Millwork')}
            ${this._navItem('/dispatch', Truck, 'Logistics')}
            ${this._navItem('/fleet', Settings, 'Fleet')}
            ${this._navItem('/reports/daily-till', LayoutDashboard, 'Daily Till')}

            <div class="mb-2 mt-4 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              ${this._sidebarOpen ? 'Accounting' : nothing}
            </div>

            ${this._navItem('/accounting/chart-of-accounts', BookOpen, 'Chart of Accounts')}
            ${this._navItem('/accounting/journal-entries', FileText, 'Journal Entries')}
            ${this._navItem('/accounting/trial-balance', LayoutDashboard, 'Trial Balance')}
          </nav>

          <!-- Footer -->
          <div class="p-3 border-t border-white/5 bg-slate-steel/50 space-y-1">
            ${this._navItem('/pricing', LayoutGrid, 'Pricing')}
            ${this._navItem('/admin/branches', Building2, 'Branches')}
            ${this._navItem('/admin', Settings, 'Admin')}
          </div>

          <!-- Collapse Toggle -->
          <button
            @click=${() => { this._sidebarOpen = !this._sidebarOpen; }}
            aria-label="${this._sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}"
            class="absolute -right-3 top-20 bg-slate-steel border border-white/10 rounded-full p-1 text-zinc-400 hover:text-white shadow-elevation-1 hover:shadow-glow transition-all duration-200 z-50 text-xs flex items-center justify-center w-6 h-6"
          >
            ${icon(this._sidebarOpen ? ChevronLeft : ChevronRight, 12)}
          </button>
        </aside>

        <!-- Main Content -->
        <main
          class="flex-1 flex flex-col min-h-screen relative w-full transition-all duration-300"
          style="margin-left: ${this._sidebarOpen ? 280 : 80}px"
        >
          <!-- Header -->
          <header class="h-16 border-b border-white/5 bg-deep-space/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-40 shadow-sm">
            <button
              @click=${() => { this._sidebarOpen = !this._sidebarOpen; }}
              aria-label="Toggle navigation menu"
              class="lg:hidden p-2 mr-4 hover:bg-white/5 rounded-md text-muted-foreground"
            >
              ${icon(Menu, 20)}
            </button>

            <div class="flex-1 max-w-xl">
              <div class="relative group">
                ${icon(Search, 16, 'absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-gable-green transition-colors')}
                <input
                  type="text"
                  placeholder="Search everything... (Cmd+K)"
                  aria-label="Search everything"
                  class="w-full bg-slate-steel/50 border border-white/5 rounded-full py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50 focus:bg-slate-steel transition-all"
                />
              </div>
            </div>

            <div class="flex items-center gap-4">
              <gable-branch-switcher></gable-branch-switcher>
              <div class="text-xs text-zinc-500 font-medium hidden lg:block bg-white/5 px-2 py-1 rounded border border-white/5">
                ⌘K
              </div>
              <div class="h-9 w-9 rounded-full bg-gradient-to-br from-gable-green/20 to-emerald-500/20 border border-gable-green/30 flex items-center justify-center text-xs font-mono font-bold text-gable-green shadow-glow cursor-pointer hover:scale-105 transition-transform">
                AD
              </div>
            </div>
          </header>

          <!-- Offline Banner -->
          ${this._isOffline ? html`
            <div class="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm px-4 py-2 text-center">
              You are offline. Some features may not be available.
            </div>
          ` : nothing}

          <!-- Page Content -->
          <div id="main-content" class="p-6 md:p-8 max-w-[1600px] w-full animate-fade-in">
            ${this.pageContent}
          </div>
        </main>

        <gable-omnibar></gable-omnibar>
        <gable-shortcuts-modal .open=${this._shortcutsOpen} @close=${() => { this._shortcutsOpen = false; }}></gable-shortcuts-modal>
      </div>
    `;
  }
}
