/**
 * ERP shell — tabbed workspace (no sidebar).
 *
 * Modules launched from Home (or navigated to directly) open as tabs in
 * the strip under the header; Home is pinned first. Tab state lives in
 * lib/workspace.ts. The old left sidebar is gone — app discovery happens
 * on the Home launcher, power users use the omnibar (⌘K).
 */
import { LitElement, html, nothing } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { cn } from '../../lib/utils.ts';
import { router } from '../../lib/router.ts';
import { workspace, menuForKey, activeMenuPath, type WorkspaceTab } from '../../lib/workspace.ts';
import '../ui/brand-logo.ts';
import '../ui/omnibar.ts';
import '../ui/shortcuts-modal.ts';
import './branch-switcher.ts';
import { icon } from '../../lib/icons.ts';
import { Search, X, Plus } from 'lucide';

@customElement('gable-app-shell')
export class GableAppShell extends LitElement {
  createRenderRoot() { return this; }

  @property({ attribute: false }) pageContent: unknown = nothing;

  @state() private _shortcutsOpen = false;
  @state() private _isOffline = !navigator.onLine;

  private _boundKeyDown = this._handleKeyDown.bind(this);
  private _boundOnline = () => { this._isOffline = false; };
  private _boundOffline = () => { this._isOffline = true; };
  private _boundRouteChanged = () => {
    workspace.syncToPath(router.currentPath);
    this.requestUpdate();
  };
  private _boundWorkspaceChanged = () => { this.requestUpdate(); };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('online', this._boundOnline);
    window.addEventListener('offline', this._boundOffline);
    router.addEventListener('route-changed', this._boundRouteChanged);
    workspace.addEventListener('workspace-changed', this._boundWorkspaceChanged);
    workspace.restore();
    workspace.syncToPath(router.currentPath);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('online', this._boundOnline);
    window.removeEventListener('offline', this._boundOffline);
    router.removeEventListener('route-changed', this._boundRouteChanged);
    workspace.removeEventListener('workspace-changed', this._boundWorkspaceChanged);
  }

  private _handleKeyDown(e: KeyboardEvent) {
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
      e.preventDefault();
      this._shortcutsOpen = true;
    }
  }

  private _tab(tab: WorkspaceTab) {
    const active = workspace.activeKey === tab.key;
    return html`
      <div
        class="${cn(
          'group relative flex items-center shrink-0 rounded-t-lg border-b-2 transition-all',
          active
            ? 'border-gable-green bg-gable-green/5 text-gable-green'
            : 'border-transparent text-zinc-400 hover:text-white hover:bg-white/5',
        )}"
      >
        <button
          @click=${() => workspace.activate(tab.key)}
          aria-label="Switch to ${tab.label}"
          aria-current=${active ? 'page' : 'false'}
          class="flex items-center gap-2 pl-3.5 py-2 text-sm font-medium ${tab.pinned ? 'pr-3.5' : 'pr-1'}"
        >
          <span class="${active ? 'text-gable-green' : ''}">${icon(tab.icon, 16)}</span>
          <span class="whitespace-nowrap">${tab.label}</span>
        </button>
        ${tab.pinned
          ? nothing
          : html`
              <button
                @click=${(e: Event) => { e.stopPropagation(); workspace.close(tab.key); }}
                aria-label="Close ${tab.label}"
                class="mr-1.5 rounded p-0.5 text-zinc-600 hover:text-white hover:bg-white/10 transition-colors ${active ? 'text-zinc-400' : ''}"
              >
                ${icon(X, 13)}
              </button>
            `}
      </div>
    `;
  }

  /** Menu band for the active tab: app identity + its own menu items. */
  private _appMenu() {
    const key = workspace.activeKey;
    if (key === 'home') return nothing;
    const menu = menuForKey(key);
    if (menu.length === 0) return nothing;
    const tab = workspace.tabs.find((t) => t.key === key);
    const active = activeMenuPath(menu, router.currentPath);
    return html`
      <div class="flex items-center gap-1 px-4 md:px-6 h-11 bg-deep-space/60 border-b border-white/5 overflow-x-auto no-scrollbar">
        ${tab
          ? html`<span class="flex items-center gap-2 pr-3 mr-2 border-r border-white/10 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 shrink-0">
              ${icon(tab.icon, 13)} ${tab.label}
            </span>`
          : nothing}
        ${menu.map(
          (item) => html`
            <a
              href="${item.path}"
              class="${cn(
                'shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                active === item.path
                  ? 'text-gable-green bg-gable-green/10'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5',
              )}"
              >${item.label}</a
            >
          `,
        )}
      </div>
    `;
  }

  render() {
    return html`
      <div class="min-h-screen bg-deep-space text-foreground flex flex-col font-sans selection:bg-gable-green/30">
        <!-- Skip Navigation -->
        <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-[#00FFA3] focus:text-[#0A0B10] focus:rounded">
          Skip to main content
        </a>

        <!-- Header -->
        <header class="h-16 border-b border-white/5 bg-deep-space/80 backdrop-blur-xl px-4 md:px-6 flex items-center gap-4 sticky top-0 z-40 shadow-sm">
          <a href="/home" aria-label="Go to Home" class="flex items-center gap-3 shrink-0">
            <gable-brand-logo variant="mark" size="md" class-name="text-white drop-shadow-glow"></gable-brand-logo>
            <span class="hidden md:block"><gable-brand-logo variant="text" size="md"></gable-brand-logo></span>
          </a>

          <div class="flex-1 max-w-xl mx-auto">
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

          <div class="flex items-center gap-4 shrink-0">
            <gable-branch-switcher></gable-branch-switcher>
            <div class="text-xs text-zinc-500 font-medium hidden lg:block bg-white/5 px-2 py-1 rounded border border-white/5">
              ⌘K
            </div>
            <div class="h-9 w-9 rounded-full bg-gradient-to-br from-gable-green/20 to-emerald-500/20 border border-gable-green/30 flex items-center justify-center text-xs font-mono font-bold text-gable-green shadow-glow cursor-pointer hover:scale-105 transition-transform">
              AD
            </div>
          </div>
        </header>

        <!-- Workspace tab strip -->
        <nav
          aria-label="Open modules"
          class="sticky top-16 z-30 flex items-end gap-1 px-3 md:px-5 pt-1.5 bg-slate-steel/60 backdrop-blur-xl border-b border-white/5 overflow-x-auto no-scrollbar"
        >
          ${workspace.tabs.map((t) => this._tab(t))}
          <button
            @click=${() => router.navigate('/home')}
            aria-label="Open an app"
            title="Open an app"
            class="ml-1 mb-1.5 shrink-0 rounded-lg p-1.5 text-zinc-500 hover:text-gable-green hover:bg-white/5 transition-colors"
          >
            ${icon(Plus, 16)}
          </button>
        </nav>

        <!-- Per-app menu band (the active tab's own navigation) -->
        ${this._appMenu()}

        <!-- Offline Banner -->
        ${this._isOffline ? html`
          <div class="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm px-4 py-2 text-center">
            You are offline. Some features may not be available.
          </div>
        ` : nothing}

        <!-- Page Content -->
        <main class="flex-1 w-full">
          <div id="main-content" class="p-6 md:p-8 max-w-[1600px] w-full mx-auto animate-fade-in">
            ${this.pageContent}
          </div>
        </main>

        <gable-omnibar></gable-omnibar>
        <gable-shortcuts-modal .open=${this._shortcutsOpen} @close=${() => { this._shortcutsOpen = false; }}></gable-shortcuts-modal>
      </div>
    `;
  }
}
