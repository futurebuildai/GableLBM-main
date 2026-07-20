/**
 * Apps — Odoo-style catalog of platform apps with per-instance
 * enable/disable. Core apps (and everything not yet converted to gated
 * registration) show as always-on; converted apps get a toggle.
 */
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { Puzzle, ShieldCheck, TriangleAlert } from 'lucide';
import { ToastService } from '../../lib/toast-service.ts';
import { appsService, AppToggleError } from '../../services/AppsService.ts';
import type { AppInfo } from '../../apps/types.ts';

@customElement('gable-apps-page')
export class AppsPage extends LitElement {
  createRenderRoot() {
    return this;
  }

  @state() private _apps: AppInfo[] = [];
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _busyKey = '';

  connectedCallback() {
    super.connectedCallback();
    void this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      this._apps = await appsService.load(true);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load apps';
    } finally {
      this._loading = false;
    }
  }

  private async _toggle(app: AppInfo) {
    this._busyKey = app.key;
    try {
      this._apps = await appsService.toggle(app.key, !app.enabled);
      ToastService.success(`${app.name} ${app.enabled ? 'disabled' : 'enabled'}`);
    } catch (err) {
      if (err instanceof AppToggleError && err.blockers.length > 0) {
        ToastService.error(`${err.message}`);
      } else {
        ToastService.error(err instanceof Error ? err.message : 'Toggle failed');
      }
    } finally {
      this._busyKey = '';
    }
  }

  private _grouped(): Map<string, AppInfo[]> {
    const groups = new Map<string, AppInfo[]>();
    for (const app of this._apps) {
      const list = groups.get(app.category) ?? [];
      list.push(app);
      groups.set(app.category, list);
    }
    return groups;
  }

  private _card(app: AppInfo) {
    const toggleable = !app.core && !app.orphaned;
    const busy = this._busyKey === app.key;
    return html`
      <div class="rounded-xl bg-slate-steel border ${app.enabled ? 'border-white/5' : 'border-white/10 opacity-60'} p-4 flex flex-col gap-3 transition-all">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="h-10 w-10 shrink-0 rounded-lg ${app.enabled ? 'bg-gable-green/10 text-gable-green' : 'bg-white/5 text-zinc-500'} flex items-center justify-center">
              ${icon(Puzzle, 20)}
            </div>
            <div class="min-w-0">
              <div class="text-sm font-semibold text-white truncate">${app.name}</div>
              <div class="text-xs text-zinc-500 font-mono truncate">${app.key}</div>
            </div>
          </div>
          ${toggleable
            ? html`
                <button
                  role="switch"
                  aria-checked=${app.enabled}
                  aria-label="${app.enabled ? 'Disable' : 'Enable'} ${app.name}"
                  ?disabled=${busy}
                  @click=${() => this._toggle(app)}
                  class="relative h-6 w-11 shrink-0 rounded-full transition-colors ${app.enabled ? 'bg-gable-green/80' : 'bg-white/10'} ${busy ? 'opacity-50 cursor-wait' : 'cursor-pointer'}"
                >
                  <span class="absolute top-0.5 ${app.enabled ? 'left-[22px]' : 'left-0.5'} h-5 w-5 rounded-full bg-white shadow transition-all"></span>
                </button>
              `
            : app.orphaned
              ? html`<span class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">${icon(TriangleAlert, 10)} Orphaned</span>`
              : html`<span class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-white/5 text-zinc-400 border border-white/10">${icon(ShieldCheck, 10)} Core</span>`}
        </div>
        <p class="text-xs text-zinc-400 leading-relaxed">${app.summary || nothing}</p>
        ${app.depends_on && app.depends_on.length > 0
          ? html`<div class="text-[11px] text-zinc-500">Requires: <span class="font-mono">${app.depends_on.join(', ')}</span></div>`
          : nothing}
      </div>
    `;
  }

  render() {
    if (this._loading) {
      return html`<div class="py-24 text-center text-zinc-500 text-sm">Loading apps…</div>`;
    }
    if (this._error) {
      return html`
        <div class="py-24 text-center">
          <p class="text-safety-red text-sm mb-4">${this._error}</p>
          <button @click=${() => this._load()} class="text-gable-green text-sm hover:underline">Retry</button>
        </div>
      `;
    }
    const groups = this._grouped();
    const enabledCount = this._apps.filter((a) => a.enabled).length;
    return html`
      <div class="space-y-8">
        <div class="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 class="text-2xl font-bold text-white flex items-center gap-3">${icon(Puzzle, 24, 'text-gable-green')} Apps</h1>
            <p class="text-sm text-zinc-400 mt-1">
              Enable or disable platform apps for this instance.
              <span class="font-mono text-zinc-500">${enabledCount}/${this._apps.length}</span> enabled.
            </p>
          </div>
        </div>

        ${[...groups.entries()].map(
          ([category, list]) => html`
            <section>
              <h2 class="mb-3 px-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider">${category}</h2>
              <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                ${list.map((app) => this._card(app))}
              </div>
            </section>
          `,
        )}
      </div>
    `;
  }
}
