/**
 * ERP Home — the launch experience for the ERP surface.
 *
 * Two internal tabs (Odoo-style): **Apps**, a launcher grid of the enabled
 * apps that have a UI entry point, and **Dashboard**, the executive KPI view
 * (the existing <gable-dashboard>, mounted lazily on first activation).
 * The active tab persists across visits.
 */
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../lib/icons.ts';
import { LayoutDashboard, LayoutGrid, Puzzle } from 'lucide';
import { cn } from '../lib/utils.ts';
import { router } from '../lib/router.ts';
import { appsService } from '../services/AppsService.ts';
import { launcherEntry } from '../apps/launcher.ts';
import type { AppInfo } from '../apps/types.ts';

type HomeTab = 'apps' | 'dashboard';
const TAB_KEY = 'gable_home_tab';

@customElement('gable-home')
export class GableHome extends LitElement {
  createRenderRoot() {
    return this;
  }

  @state() private _tab: HomeTab = (localStorage.getItem(TAB_KEY) as HomeTab) || 'apps';
  @state() private _apps: AppInfo[] = [];
  @state() private _dashboardLoaded = false;

  private _onAppsChanged = () => {
    this._apps = appsService.apps;
  };

  connectedCallback() {
    super.connectedCallback();
    appsService.addEventListener('apps-changed', this._onAppsChanged);
    void appsService
      .load()
      .then((apps) => {
        this._apps = apps;
      })
      .catch(() => {
        /* backend unreachable: grid renders empty-state below */
      });
    if (this._tab === 'dashboard') void this._loadDashboard();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    appsService.removeEventListener('apps-changed', this._onAppsChanged);
  }

  private async _loadDashboard() {
    await import('./Dashboard.ts');
    this._dashboardLoaded = true;
  }

  private _setTab(tab: HomeTab) {
    this._tab = tab;
    localStorage.setItem(TAB_KEY, tab);
    if (tab === 'dashboard' && !this._dashboardLoaded) void this._loadDashboard();
  }

  private _tabButton(tab: HomeTab, iconData: Parameters<typeof icon>[0], label: string) {
    const active = this._tab === tab;
    return html`
      <button
        role="tab"
        aria-selected=${active}
        @click=${() => this._setTab(tab)}
        class="${cn(
          'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all',
          active
            ? 'text-gable-green bg-gable-green/10 shadow-[inset_0_0_0_1px_rgba(0,255,163,0.25)]'
            : 'text-zinc-400 hover:text-white hover:bg-white/5',
        )}"
      >
        ${icon(iconData, 18)} ${label}
      </button>
    `;
  }

  private _tiles() {
    const tiles = this._apps
      .filter((a) => a.enabled)
      .map((a) => ({ app: a, entry: launcherEntry(a.key) }))
      .filter((t) => t.entry !== null);
    if (tiles.length === 0) {
      return html`<div class="py-16 text-center text-sm text-zinc-500">
        Loading apps… if this persists, check the API connection.
      </div>`;
    }
    return html`
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
        ${tiles.map(
          ({ app, entry }) => html`
            <button
              @click=${() => router.navigate(entry!.path)}
              aria-label="Open ${app.name}"
              class="group flex flex-col items-center gap-3 rounded-xl bg-slate-steel border border-white/5 p-6 transition-all hover:border-gable-green/40 hover:shadow-glow hover:-translate-y-0.5"
            >
              <div
                class="h-14 w-14 rounded-2xl bg-gable-green/10 text-gable-green flex items-center justify-center group-hover:bg-gable-green/20 transition-colors"
              >
                ${icon(entry!.icon, 28)}
              </div>
              <div class="text-sm font-medium text-white text-center leading-tight">${app.name}</div>
              <div class="text-[10px] uppercase tracking-wider text-zinc-500">${app.category}</div>
            </button>
          `,
        )}
      </div>
    `;
  }

  render() {
    return html`
      <div class="space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div role="tablist" class="flex items-center gap-2 bg-deep-space/60 border border-white/5 rounded-xl p-1.5">
            ${this._tabButton('apps', LayoutGrid, 'Apps')}
            ${this._tabButton('dashboard', LayoutDashboard, 'Dashboard')}
          </div>
          ${this._tab === 'apps'
            ? html`
                <a
                  href="/admin/apps"
                  class="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-gable-green transition-colors"
                >
                  ${icon(Puzzle, 14)} Manage apps
                </a>
              `
            : nothing}
        </div>

        ${this._tab === 'apps'
          ? this._tiles()
          : this._dashboardLoaded
            ? html`<gable-dashboard></gable-dashboard>`
            : html`<div class="py-16 text-center text-sm text-zinc-500">Loading dashboard…</div>`}
      </div>
    `;
  }
}
