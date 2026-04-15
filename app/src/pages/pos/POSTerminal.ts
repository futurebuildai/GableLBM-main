import { LitElement, html, nothing } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { posService } from '../../services/POSService';
import type { POSTransaction, QuickSearchResult, POSLineItem } from '../../types/pos';
import '../../components/BarcodeScanner.ts';

/**
 * POSTerminal -- Full-screen retail counter sales interface.
 *
 * Design Goals:
 * - Seasonal hire can learn in < 10 minutes
 * - Ring up a 5-item sale in under 60 seconds
 * - Support split payments (cash + card + check + account)
 */
@customElement('gable-pos-terminal')
export class POSTerminal extends LitElement {
  createRenderRoot() { return this; }

  @state() private _transaction: POSTransaction | null = null;
  @state() private _searchQuery = '';
  @state() private _searchResults: QuickSearchResult[] = [];
  @state() private _showTender = false;
  @state() private _tenderMethod = '';
  @state() private _tenderAmount = '';
  @state() private _loading = false;
  @state() private _error: string | null = null;
  @state() private _success: string | null = null;
  @state() private _isScanning = false;

  @query('#pos-search-input') private _searchInput!: HTMLInputElement;

  private _newTxTimer: ReturnType<typeof setTimeout> | null = null;
  private _errorTimer: ReturnType<typeof setTimeout> | null = null;
  private _searchDebounce: ReturnType<typeof setTimeout> | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._startNewTransaction();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._newTxTimer) clearTimeout(this._newTxTimer);
    if (this._errorTimer) clearTimeout(this._errorTimer);
    if (this._searchDebounce) clearTimeout(this._searchDebounce);
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('_searchQuery')) {
      this._debounceSearch();
    }
  }

  /* ---- Barcode scanning ---- */

  private async _handleScan(barcode: string) {
    try {
      const results = await posService.searchProducts(barcode);
      if (results && results.length > 0) {
        const exactMatch = results.find(r => r.sku === barcode || r.product_id === barcode) || results[0];
        await this._addItem(exactMatch);
      } else {
        this._error = `Product not found for barcode: ${barcode}`;
        this._errorTimer = setTimeout(() => { this._error = null; }, 3000);
      }
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : 'Error scanning barcode';
    }
  }

  /* ---- Product search with debounce ---- */

  private _debounceSearch() {
    if (this._searchDebounce) clearTimeout(this._searchDebounce);

    if (this._searchQuery.length < 2) {
      this._searchResults = [];
      return;
    }

    this._searchDebounce = setTimeout(async () => {
      try {
        const results = await posService.searchProducts(this._searchQuery);
        this._searchResults = results;
      } catch {
        this._searchResults = [];
      }
    }, 200);
  }

  /* ---- Transaction management ---- */

  private async _startNewTransaction() {
    try {
      this._loading = true;
      this._error = null;
      this._success = null;
      const cashierId = localStorage.getItem('user_id') || '';
      if (!cashierId) {
        this._error = 'No cashier ID found. Please log in again.';
        return;
      }
      const tx = await posService.startTransaction('REG-01', cashierId);
      this._transaction = tx;
      this._showTender = false;
      // Focus the search input after render
      this.updateComplete.then(() => {
        this._searchInput?.focus();
      });
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : 'Failed to start transaction';
    } finally {
      this._loading = false;
    }
  }

  private async _addItem(product: QuickSearchResult) {
    if (!this._transaction) return;
    try {
      const updated = await posService.addItem(this._transaction.id, {
        product_id: product.product_id,
        quantity: 1,
        uom: product.uom,
      });
      this._transaction = updated;
      this._searchQuery = '';
      this._searchResults = [];
      this._searchInput?.focus();
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : 'Failed to add item';
    }
  }

  private async _removeItem(itemId: string) {
    if (!this._transaction) return;
    try {
      const updated = await posService.removeItem(this._transaction.id, itemId);
      this._transaction = updated;
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : 'Failed to remove item';
    }
  }

  private _handleTender(method: string) {
    if (!this._transaction) return;
    this._tenderMethod = method;
    this._tenderAmount = (this._transaction.total / 100).toFixed(2);
    this._showTender = true;
  }

  private async _completeSale() {
    if (!this._transaction || !this._tenderMethod) return;
    try {
      this._loading = true;
      this._error = null;
      const amount = parseFloat(this._tenderAmount);
      if (isNaN(amount) || amount <= 0) {
        this._error = 'Invalid tender amount';
        return;
      }

      const completed = await posService.completeTransaction(this._transaction.id, [{
        method: this._tenderMethod,
        amount,
      }]);
      this._transaction = completed;
      this._success = `Sale completed! Total: $${(completed.total / 100).toFixed(2)}`;
      this._showTender = false;

      // Auto-start new transaction after 2 seconds
      this._newTxTimer = setTimeout(() => {
        this._startNewTransaction();
      }, 2000);
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : 'Failed to complete sale';
    } finally {
      this._loading = false;
    }
  }

  private async _voidTransaction() {
    if (!this._transaction) return;
    if (!window.confirm('Void this transaction?')) return;
    try {
      await posService.voidTransaction(this._transaction.id);
      this._startNewTransaction();
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : 'Failed to void transaction';
    }
  }

  /* ---- Render ---- */

  render() {
    const totalDollars = this._transaction ? (this._transaction.total / 100).toFixed(2) : '0.00';
    const subtotalDollars = this._transaction ? (this._transaction.subtotal / 100).toFixed(2) : '0.00';
    const taxDollars = this._transaction ? (this._transaction.tax_amount / 100).toFixed(2) : '0.00';
    const lineItems: POSLineItem[] = this._transaction?.line_items || [];

    return html`
      <div style="display:flex;flex-direction:column;height:100vh;background:#0d1117;color:#e6edf3;font-family:'Outfit',-apple-system,sans-serif">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 24px;background:#161b22;border-bottom:1px solid #21262d">
          <div style="display:flex;align-items:center;gap:12px">
            <h1 style="font-size:18px;font-weight:700;margin:0;color:#e6edf3">POS Terminal</h1>
            <span style="font-size:11px;padding:2px 8px;background:#238636;border-radius:12px;color:#fff;font-weight:600">REG-01</span>
            ${this._transaction ? html`
              <span style="font-size:11px;padding:2px 8px;background:#1f6feb;border-radius:12px;color:#fff;font-family:monospace">
                TX: ${this._transaction.id.slice(0, 8)}
              </span>
            ` : nothing}
          </div>
          <div style="display:flex;gap:8px">
            <button @click=${() => this._startNewTransaction()} style="padding:6px 16px;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:13px;cursor:pointer">
              New Sale
            </button>
          </div>
        </div>

        <!-- Alerts -->
        ${this._error ? html`
          <div style="padding:10px 16px;background:#3d1114;border-bottom:1px solid #f8514940;color:#f85149;font-size:13px;display:flex;justify-content:space-between;align-items:center">
            ${this._error}
            <button @click=${() => { this._error = null; }} style="background:none;border:none;color:#f85149;font-size:16px;cursor:pointer" aria-label="Dismiss error">\u00d7</button>
          </div>
        ` : nothing}
        ${this._success ? html`
          <div style="padding:10px 16px;background:#0d2818;border-bottom:1px solid #2ea04340;color:#3fb950;font-size:14px;font-weight:600;text-align:center">
            ${this._success}
          </div>
        ` : nothing}

        <!-- Main Layout -->
        <div style="display:flex;flex:1;overflow:hidden">
          <!-- Left: Cart -->
          <div style="flex:1;display:flex;flex-direction:column;border-right:1px solid #21262d">
            <!-- Search Bar -->
            <div style="position:relative;padding:16px;border-bottom:1px solid #21262d">
              <div style="display:flex;gap:8px">
                <input
                  id="pos-search-input"
                  type="text"
                  placeholder="Search product by SKU or description..."
                  .value=${this._searchQuery}
                  @input=${(e: Event) => { this._searchQuery = (e.target as HTMLInputElement).value; }}
                  style="flex:1;padding:12px 16px;background:#0d1117;border:2px solid #30363d;border-radius:8px;color:#e6edf3;font-size:16px;outline:none;box-sizing:border-box"
                  aria-label="Search product by SKU or description"
                />
                <button
                  @click=${() => { this._isScanning = true; }}
                  style="background:#238636;border:none;border-radius:8px;color:#fff;padding:0 16px;cursor:pointer;font-weight:bold;display:flex;align-items:center;gap:8px"
                >
                  Scan
                </button>
              </div>
              ${this._isScanning ? html`
                <gable-barcode-scanner
                  @scan=${(e: CustomEvent) => { this._isScanning = false; this._handleScan(e.detail); }}
                  @close=${() => { this._isScanning = false; }}
                ></gable-barcode-scanner>
              ` : nothing}
              ${this._searchResults.length > 0 ? html`
                <div style="position:absolute;top:100%;left:16px;right:16px;background:#161b22;border:1px solid #30363d;border-radius:8px;z-index:10;max-height:300px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.4)">
                  ${this._searchResults.map(result => html`
                    <button
                      @click=${() => this._addItem(result)}
                      style="display:flex;width:100%;padding:10px 14px;background:transparent;border:none;border-bottom:1px solid #21262d;color:#e6edf3;cursor:pointer;text-align:left;gap:12px;align-items:center;font-size:13px"
                    >
                      <span style="font-family:monospace;font-size:12px;color:#58a6ff;min-width:100px">${result.sku}</span>
                      <span style="flex:1;color:#c9d1d9">${result.description}</span>
                      <span style="font-weight:600;color:#3fb950">$${result.unit_price.toFixed(2)}/${result.uom}</span>
                      <span style="font-size:11px;color:#8b949e">${result.in_stock} avail</span>
                    </button>
                  `)}
                </div>
              ` : nothing}
            </div>

            <!-- Line Items -->
            <div style="flex:1;overflow-y:auto;padding:8px 16px">
              ${lineItems.length === 0 ? html`
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#484f58">
                  <div style="font-size:48px;margin-bottom:12px">&#x1f6d2;</div>
                  <p>Search and add products to start a sale</p>
                </div>
              ` : html`
                <table style="width:100%;border-collapse:collapse" aria-label="Cart items">
                  <thead>
                    <tr>
                      <th style="text-align:left;padding:8px 12px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #21262d">Item</th>
                      <th style="text-align:center;padding:8px 12px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #21262d">Qty</th>
                      <th style="text-align:right;padding:8px 12px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #21262d">Price</th>
                      <th style="text-align:right;padding:8px 12px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #21262d">Total</th>
                      <th style="padding:8px 12px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #21262d;width:40px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lineItems.map((item: POSLineItem) => html`
                      <tr>
                        <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #161b22">${item.description}</td>
                        <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #161b22;text-align:center">
                          ${item.quantity} ${item.uom}
                        </td>
                        <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #161b22;text-align:right">
                          $${(item.unit_price / 100).toFixed(2)}
                        </td>
                        <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #161b22;text-align:right;font-weight:600">
                          $${(item.line_total / 100).toFixed(2)}
                        </td>
                        <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #161b22">
                          <button
                            @click=${() => this._removeItem(item.id)}
                            style="background:none;border:none;color:#f85149;font-size:18px;cursor:pointer;padding:2px 6px;border-radius:4px"
                            title="Remove"
                            aria-label="Remove ${item.description}"
                          >\u00d7</button>
                        </td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              `}
            </div>
          </div>

          <!-- Right: Totals + Tenders -->
          <div style="width:360px;display:flex;flex-direction:column;background:#161b22;padding:24px">
            <div style="margin-bottom:24px">
              <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:#8b949e">
                <span>Subtotal</span>
                <span>$${subtotalDollars}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:#8b949e">
                <span>Tax</span>
                <span>$${taxDollars}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:16px;font-weight:700;color:#e6edf3;border-top:1px solid #30363d;margin-top:8px">
                <span>TOTAL</span>
                <span style="font-size:28px;font-weight:800;color:#3fb950">$${totalDollars}</span>
              </div>
            </div>

            ${!this._showTender ? html`
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1">
                <button @click=${() => this._handleTender('CASH')} style="padding:20px;background:#21262d;border:1px solid #30363d;border-radius:12px;color:#e6edf3;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.15s;text-align:center" ?disabled=${lineItems.length === 0}>
                  Cash
                </button>
                <button @click=${() => this._handleTender('CARD')} style="padding:20px;background:#21262d;border:1px solid #30363d;border-radius:12px;color:#e6edf3;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.15s;text-align:center" ?disabled=${lineItems.length === 0}>
                  Card
                </button>
                <button @click=${() => this._handleTender('CHECK')} style="padding:20px;background:#21262d;border:1px solid #30363d;border-radius:12px;color:#e6edf3;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.15s;text-align:center" ?disabled=${lineItems.length === 0}>
                  Check
                </button>
                <button @click=${() => this._handleTender('ACCOUNT')} style="padding:20px;background:#21262d;border:1px solid #30363d;border-radius:12px;color:#e6edf3;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.15s;text-align:center" ?disabled=${lineItems.length === 0}>
                  Account
                </button>
              </div>
            ` : html`
              <div style="display:flex;flex-direction:column;gap:12px">
                <div style="font-size:18px;font-weight:700;text-align:center;padding:8px">
                  ${this._tenderMethod === 'CASH' ? 'Cash' : ''}
                  ${this._tenderMethod === 'CARD' ? 'Card' : ''}
                  ${this._tenderMethod === 'CHECK' ? 'Check' : ''}
                  ${this._tenderMethod === 'ACCOUNT' ? 'Account' : ''}
                </div>
                <input
                  type="number"
                  .value=${this._tenderAmount}
                  @input=${(e: Event) => { this._tenderAmount = (e.target as HTMLInputElement).value; }}
                  style="padding:14px;background:#0d1117;border:2px solid #238636;border-radius:8px;color:#e6edf3;font-size:24px;font-weight:700;text-align:center;outline:none"
                  step="0.01"
                  aria-label="Tender amount"
                />
                <button
                  @click=${() => this._completeSale()}
                  style="padding:16px;background:#238636;border:none;border-radius:8px;color:#fff;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px"
                  ?disabled=${this._loading}
                >
                  ${this._loading ? 'Processing...' : `Complete Sale \u2014 $${totalDollars}`}
                </button>
                <button
                  @click=${() => { this._showTender = false; }}
                  style="padding:10px;background:transparent;border:1px solid #30363d;border-radius:8px;color:#8b949e;font-size:14px;cursor:pointer"
                >
                  Cancel
                </button>
              </div>
            `}

            <!-- Quick Actions -->
            <div style="padding:16px 0;margin-top:auto;display:flex;gap:8px">
              <button
                @click=${() => this._voidTransaction()}
                style="flex:1;padding:10px;background:transparent;border:1px solid #f8514940;border-radius:8px;color:#f85149;font-size:13px;cursor:pointer"
                ?disabled=${!this._transaction || lineItems.length === 0}
              >
                Void
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

export default POSTerminal;
