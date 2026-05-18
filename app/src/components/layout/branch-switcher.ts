/**
 * <gable-branch-switcher> — header-mounted dropdown that lets the user pick
 * the branch their requests are scoped to. The selection persists across
 * navigations via BranchContext (localStorage-backed) and triggers a
 * `gable:branch-changed` event on `window` so pages can re-fetch.
 */
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { Building2, ChevronDown, Check } from 'lucide';
import { branchContext } from '../../services/BranchContext.ts';
import type { BranchChangedDetail } from '../../services/BranchContext.ts';
import type { BranchSummary } from '../../types/location.ts';

@customElement('gable-branch-switcher')
export class GableBranchSwitcher extends LitElement {
  createRenderRoot() { return this; }

  @state() private _open = false;
  @state() private _branches: BranchSummary[] = [];
  @state() private _currentId: string | null = null;

  private _onBranchChanged = (e: Event) => {
    const detail = (e as CustomEvent<BranchChangedDetail>).detail;
    this._currentId = detail?.branchId ?? branchContext.currentId;
    this._branches = branchContext.branches;
  };

  private _onDocClick = (e: MouseEvent) => {
    if (!this._open) return;
    const target = e.target as Node;
    if (!this.contains(target)) {
      this._open = false;
    }
  };

  connectedCallback() {
    super.connectedCallback();
    this._branches = branchContext.branches;
    this._currentId = branchContext.currentId;
    branchContext.addEventListener('branch-changed', this._onBranchChanged);
    document.addEventListener('click', this._onDocClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    branchContext.removeEventListener('branch-changed', this._onBranchChanged);
    document.removeEventListener('click', this._onDocClick);
  }

  private _pick(id: string | null) {
    branchContext.setCurrent(id);
    this._open = false;
  }

  private _label(): string {
    const cur = this._branches.find((b) => b.id === this._currentId);
    if (cur) return cur.name || cur.code;
    if (this._currentId === null && this._branches.length > 0) return 'All Branches';
    return 'No branch';
  }

  render() {
    if (this._branches.length === 0) {
      // Don't render the switcher when the user has no branches; the
      // app-shell route guard handles the "no access" redirect.
      return nothing;
    }

    return html`
      <div class="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded="${this._open}"
          @click=${(e: MouseEvent) => { e.stopPropagation(); this._open = !this._open; }}
          class="flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/10 bg-slate-steel/50 hover:bg-slate-steel hover:border-gable-green/30 transition-colors text-sm text-zinc-200"
        >
          <span class="text-gable-green">${icon(Building2, 14)}</span>
          <span class="font-medium max-w-[160px] truncate">${this._label()}</span>
          <span class="text-zinc-500">${icon(ChevronDown, 14)}</span>
        </button>

        ${this._open ? html`
          <div
            role="listbox"
            class="absolute right-0 mt-2 w-64 bg-slate-steel border border-white/10 rounded-lg shadow-elevation-2 overflow-hidden z-50"
            @click=${(e: MouseEvent) => e.stopPropagation()}
          >
            <div class="py-1 max-h-80 overflow-y-auto">
              ${this._branches.map((b) => {
                const active = b.id === this._currentId;
                return html`
                  <button
                    type="button"
                    role="option"
                    aria-selected="${active}"
                    @click=${() => this._pick(b.id)}
                    class="w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-white/5 ${active ? 'text-gable-green' : 'text-zinc-200'}"
                  >
                    <span class="w-4 flex-shrink-0">
                      ${active ? icon(Check, 14) : nothing}
                    </span>
                    <span class="font-mono text-xs text-zinc-500 w-12 flex-shrink-0">${b.code}</span>
                    <span class="flex-1 truncate">${b.name || b.code}</span>
                    ${b.is_home ? html`<span class="text-[10px] uppercase tracking-wider text-gable-green/70">home</span>` : nothing}
                  </button>
                `;
              })}
            </div>
          </div>
        ` : nothing}
      </div>
    `;
  }
}
