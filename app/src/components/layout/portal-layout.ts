import { LitElement, html, nothing } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { cn } from '../../lib/utils.ts';
import { router } from '../../lib/router.ts';
import { clearToken } from '../../services/PortalService.ts';
import type { PortalConfig, PortalUser } from '../../types/portal.ts';
import '../ui/brand-logo.ts';
import { icon } from '../../lib/icons.ts';
import { LayoutDashboard, FileText, ShoppingCart, Truck, LogOut, ChevronLeft, ChevronRight, Bell, Users, FolderGit2 } from 'lucide';

@customElement('gable-portal-layout')
export class GablePortalLayout extends LitElement {
  createRenderRoot() { return this; }

  @property({ attribute: false }) pageContent: unknown = nothing;

  @state() private _sidebarOpen = window.innerWidth >= 768;

  private _config: PortalConfig | null = null;
  private _user: PortalUser | null = null;

  connectedCallback() {
    super.connectedCallback();
    try {
      const stored = localStorage.getItem('portal_config');
      this._config = stored ? JSON.parse(stored) as PortalConfig : null;
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem('portal_user');
      this._user = stored ? JSON.parse(stored) as PortalUser : null;
    } catch { /* ignore */ }

    if (!this._user) {
      router.replace('/portal/login');
    }
    router.addEventListener('route-changed', this._boundRouteChanged);
  }

  private _boundRouteChanged = () => { this.requestUpdate(); };

  disconnectedCallback() {
    super.disconnectedCallback();
    router.removeEventListener('route-changed', this._boundRouteChanged);
  }

  private async _handleLogout() {
    await clearToken();
    localStorage.removeItem('portal_config');
    localStorage.removeItem('portal_user');
    router.navigate('/');
  }

  private get _primaryColor() {
    return this._config?.primary_color || '#00FFA3';
  }

  private get _navItems() {
    return [
      { iconData: LayoutDashboard, label: 'Dashboard', path: '/portal' },
      { iconData: FolderGit2, label: 'Projects', path: '/portal/projects' },
      { iconData: ShoppingCart, label: 'Orders', path: '/portal/orders' },
      { iconData: FileText, label: 'Invoices', path: '/portal/invoices' },
      { iconData: Truck, label: 'Deliveries', path: '/portal/deliveries' },
      { iconData: Users, label: 'Team', path: '/portal/team' },
    ];
  }

  render() {
    const primary = this._primaryColor;
    const path = router.currentPath;

    return html`
      <div class="min-h-screen text-foreground flex font-sans selection:bg-gable-green/30" style="--portal-primary: ${primary}; background-color: #0C0E14;">
        <!-- Mobile overlay -->
        ${this._sidebarOpen ? html`<div class="fixed inset-0 z-40 bg-black/50 md:hidden" @click=${() => { this._sidebarOpen = false; }}></div>` : nothing}

        <!-- Sidebar -->
        <aside class="${cn(
          'border-r border-white/10 transition-all duration-300 flex flex-col fixed inset-y-0 left-0 z-50 shadow-2xl',
          this._sidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-20'
        )}" style="background-color: #111320;">
          <!-- Brand Header -->
          <div class="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-white/5 backdrop-blur-sm">
            ${this._sidebarOpen ? html`
              <div class="flex items-center gap-3">
                ${this._config?.logo_url
                  ? html`<img src="${this._config.logo_url}" alt="${this._config?.dealer_name || ''}" class="h-8 w-auto object-contain"/>`
                  : html`<gable-brand-logo variant="text" size="md"></gable-brand-logo>`}
              </div>
            ` : html`
              <div class="mx-auto flex items-center justify-center w-8 h-8">
                <gable-brand-logo variant="mark" size="sm" class-name="text-white"></gable-brand-logo>
              </div>
            `}
          </div>

          <!-- Navigation -->
          <nav aria-label="Portal navigation" class="flex-1 py-6 px-3 space-y-1">
            ${this._navItems.map(item => {
              const isActive = path === item.path;
              return html`
                <a href="${item.path}" class="${cn(
                  'flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative overflow-hidden',
                  isActive ? 'text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                )}" style="${isActive ? `background-color: ${primary}15; color: ${primary}; box-shadow: 0 0 20px ${primary}15;` : ''}">
                  ${isActive ? html`<div class="absolute inset-y-0 left-0 w-1 rounded-r-full" style="background-color: ${primary}"></div>` : nothing}
                  <span class="${cn('transition-transform duration-200 group-hover:scale-110', isActive && 'scale-110')}">
                    ${icon(item.iconData, 20)}
                  </span>
                  <span class="${cn('font-medium transition-all duration-300 origin-left',
                    this._sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 absolute'
                  )}">${item.label}</span>
                </a>
              `;
            })}
          </nav>

          <!-- Footer -->
          <div class="p-4 border-t border-white/5 bg-white/5">
            <button @click=${() => { this._sidebarOpen = !this._sidebarOpen; }}
                    aria-label="${this._sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}"
                    class="w-full flex items-center justify-center p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-colors">
              ${icon(this._sidebarOpen ? ChevronLeft : ChevronRight, 20)}
            </button>

            <div class="${cn('mt-4 flex items-center gap-3 transition-all duration-300', !this._sidebarOpen && 'justify-center')}">
              <div class="h-8 w-8 rounded-full p-[1px] shrink-0" style="background: linear-gradient(135deg, ${primary}, ${primary}80)">
                <div class="h-full w-full rounded-full flex items-center justify-center" style="background-color: #111320">
                  <span class="font-bold text-xs text-white">
                    ${this._user?.name?.split(' ').map((n: string) => n[0]).join('') || '??'}
                  </span>
                </div>
              </div>
              ${this._sidebarOpen ? html`
                <div class="overflow-hidden flex-1">
                  <div class="text-sm font-medium text-white truncate">${this._user?.name || 'Contractor'}</div>
                  <div class="text-xs text-zinc-500 truncate">${this._user?.email || ''}</div>
                </div>
                <button @click=${() => this._handleLogout()} aria-label="Sign out"
                        class="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-red-400 transition-colors" title="Sign Out">
                  ${icon(LogOut, 16)}
                </button>
              ` : nothing}
            </div>
          </div>
        </aside>

        <!-- Main Content -->
        <main class="${cn('flex-1 flex flex-col min-h-screen transition-all duration-300', this._sidebarOpen ? 'md:ml-64' : 'md:ml-20')}">
          <!-- Header -->
          <header class="h-16 border-b border-white/10 backdrop-blur-md sticky top-0 z-40 px-8 flex items-center justify-between shadow-sm" style="background-color: #111320cc;">
            <div class="flex items-center gap-4">
              <button aria-label="Toggle navigation menu" class="md:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                      @click=${() => { this._sidebarOpen = !this._sidebarOpen; }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
              <h2 class="text-xl font-semibold text-white tracking-tight">
                ${this._navItems.find(i => i.path === path)?.label || 'Portal'}
              </h2>
            </div>
            <div class="flex items-center gap-4">
              ${this._config?.support_email ? html`<span class="text-xs text-zinc-500">Support: ${this._config.support_email}</span>` : nothing}
              <button aria-label="Notifications" class="relative p-2 text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-white/5">
                ${icon(Bell, 20)}
              </button>
            </div>
          </header>

          <div class="flex-1 p-4 md:p-8 overflow-auto">
            ${this.pageContent}
          </div>
        </main>
      </div>
    `;
  }
}
