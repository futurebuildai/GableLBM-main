import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { WifiOff, Wifi, RefreshCw, Cloud, Check } from 'lucide';

@customElement('gable-offline-banner')
export class GableOfflineBanner extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean, attribute: 'is-online' }) isOnline = true;
  @property({ type: Number, attribute: 'pending-count' }) pendingCount = 0;
  @property({ type: Number, attribute: 'catalog-count' }) catalogCount = 0;
  @property({ type: Boolean, attribute: 'is-syncing' }) isSyncing = false;
  @property({ type: String, attribute: 'last-sync-time' }) lastSyncTime: string | null = null;

  private _formatTime(iso: string | null): string {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private _handleSyncNow() {
    this.dispatchEvent(new CustomEvent('sync-now', { bubbles: true, composed: true }));
  }

  private _handleRefreshCatalog() {
    this.dispatchEvent(new CustomEvent('refresh-catalog', { bubbles: true, composed: true }));
  }

  render() {
    if (this.isOnline && this.pendingCount === 0) {
      return nothing;
    }

    return html`
      <div class="flex items-center justify-between px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-300 ${this.isOnline
        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
      }">
        <div class="flex items-center gap-3">
          ${this.isOnline
            ? icon(Wifi, 16, 'text-emerald-400')
            : icon(WifiOff, 16, 'animate-pulse')
          }

          <span>
            ${!this.isOnline ? 'OFFLINE MODE' : ''}
            ${this.isOnline && this.pendingCount > 0 ? 'Pending Sync' : ''}
          </span>

          ${this.pendingCount > 0 ? html`
            <span class="px-2 py-0.5 rounded-full bg-white/10 text-xs font-mono">
              ${this.pendingCount} transaction${this.pendingCount !== 1 ? 's' : ''} queued
            </span>
          ` : nothing}

          ${!this.isOnline ? html`
            <span class="text-xs text-zinc-500">
              ${this.catalogCount.toLocaleString()} products cached
            </span>
          ` : nothing}
        </div>

        <div class="flex items-center gap-2">
          ${this.isOnline && this.pendingCount > 0 ? html`
            <button
              @click=${this._handleSyncNow}
              ?disabled=${this.isSyncing}
              class="flex items-center gap-1.5 px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs font-bold transition-colors disabled:opacity-50"
            >
              ${this.isSyncing
                ? icon(RefreshCw, 14, 'animate-spin')
                : icon(Cloud, 14)
              }
              ${this.isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          ` : nothing}

          ${this.isOnline ? html`
            <button
              @click=${this._handleRefreshCatalog}
              class="flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-xs text-zinc-400 transition-colors"
              title="Refresh product catalog for offline use"
            >
              ${icon(RefreshCw, 12)} Catalog
            </button>
          ` : nothing}

          ${this.lastSyncTime ? html`
            <span class="text-xs text-zinc-500 flex items-center gap-1">
              ${icon(Check, 12)} ${this._formatTime(this.lastSyncTime)}
            </span>
          ` : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-offline-banner': GableOfflineBanner;
  }
}
