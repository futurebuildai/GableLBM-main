import { LitElement, html, nothing } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { posService } from '../../services/POSService';
import type { POSTransaction, QuickSearchResult, POSLineItem, AddTenderRequest, TransactionSummary } from '../../types/pos';
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
  @state() private _loading = false;
  @state() private _error: string | null = null;
  @state() private _success: string | null = null;
  @state() private _isScanning = false;

  // Split tender state
  @state() private _tenders: AddTenderRequest[] = [];
  @state() private _showTenderInput = false;
  @state() private _tenderMethod = '';
  @state() private _tenderAmount = '';

  // Customer lookup state
  @state() private _customerQuery = '';
  @state() private _customerResults: Array<{ id: string; name: string; account_number: string }> = [];
  @state() private _selectedCustomer: { id: string; name: string; account_number: string } | null = null;

  // Transaction history drawer
  @state() private _showHistory = false;
  @state() private _historyItems: TransactionSummary[] = [];
  @state() private _historyDetail: POSTransaction | null = null;

  // Receipt state
  @state() private _completedTransaction: POSTransaction | null = null;
  @state() private _showReceipt = false;
  @state() private _isListening = false;

  private _recognition: any = null;
  private _successTimer: ReturnType<typeof setTimeout> | null = null;

  @query('#pos-search-input') private _searchInput!: HTMLInputElement;

  private _newTxTimer: ReturnType<typeof setTimeout> | null = null;
  private _errorTimer: ReturnType<typeof setTimeout> | null = null;
  private _searchDebounce: ReturnType<typeof setTimeout> | null = null;
  private _customerDebounce: ReturnType<typeof setTimeout> | null = null;
  private _boundKeyHandler = this._handleKeyDown.bind(this);

  connectedCallback() {
    super.connectedCallback();
    this._startNewTransaction();
    document.addEventListener('keydown', this._boundKeyHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._boundKeyHandler);
    if (this._newTxTimer) clearTimeout(this._newTxTimer);
    if (this._errorTimer) clearTimeout(this._errorTimer);
    if (this._successTimer) clearTimeout(this._successTimer);
    if (this._searchDebounce) clearTimeout(this._searchDebounce);
    if (this._customerDebounce) clearTimeout(this._customerDebounce);
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('_searchQuery')) {
      this._debounceSearch();
    }
    if (changed.has('_customerQuery')) {
      this._debounceCustomerSearch();
    }
  }

  /* ---- Keyboard shortcuts ---- */

  private _handleKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

    // F2 or Alt+N: New sale
    if (e.key === 'F2' || (e.altKey && e.key === 'n')) {
      e.preventDefault();
      this._startNewTransaction();
      return;
    }
    // F8 or Alt+V: Void transaction
    if (e.key === 'F8' || (e.altKey && e.key === 'v')) {
      e.preventDefault();
      this._voidTransaction();
      return;
    }
    // F12 or Enter (when not in an input): Complete/tender
    if (e.key === 'F12' || (e.key === 'Enter' && !isInput)) {
      e.preventDefault();
      const lineItems = this._transaction?.line_items || [];
      if (lineItems.length > 0 && this._tenders.length > 0) {
        this._completeSale();
      }
      return;
    }
    // Escape: Clear search / close dropdowns / close receipt / close history
    if (e.key === 'Escape') {
      e.preventDefault();
      this._searchQuery = '';
      this._searchResults = [];
      this._customerQuery = '';
      this._customerResults = [];
      this._showTenderInput = false;
      this._showReceipt = false;
      this._showHistory = false;
      this._historyDetail = null;
      return;
    }
    // / or F3: Focus product search
    if ((e.key === '/' || e.key === 'F3') && !isInput) {
      e.preventDefault();
      this._searchInput?.focus();
      return;
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

  /* ---- Voice Search ---- */

  private _toggleVoiceSearch() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this._error = 'Speech Recognition is not supported in this browser. Please use Google Chrome.';
      this._errorTimer = setTimeout(() => { this._error = null; }, 3000);
      return;
    }

    if (this._isListening) {
      if (this._recognition) {
        this._recognition.stop();
      }
      this._isListening = false;
      return;
    }

    try {
      if (!this._recognition) {
        this._recognition = new SpeechRecognition();
        this._recognition.continuous = false;
        this._recognition.interimResults = false;
        this._recognition.lang = 'en-US';

        this._recognition.onstart = () => {
          this._isListening = true;
          this._error = null;
        };

        this._recognition.onresult = async (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            this._searchQuery = transcript;
            this._loading = true;
            this._error = null;
            try {
              const results = await posService.searchProducts(transcript);
              this._searchResults = results;
              
              if (results && results.length > 0) {
                const normalizedTranscript = transcript.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                
                // Try finding an exact match by SKU or description (ignoring non-alphanumeric chars)
                const exactMatch = results.find(r => 
                  r.sku.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedTranscript || 
                  r.description.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedTranscript
                );
                
                if (exactMatch) {
                  await this._addItem(exactMatch);
                  this._success = `Voice matched & added: ${exactMatch.description}`;
                  if (this._successTimer) clearTimeout(this._successTimer);
                  this._successTimer = setTimeout(() => { this._success = null; }, 4000);
                } else if (results.length === 1) {
                  // If there is exactly one result, add it directly to speed up checkout
                  await this._addItem(results[0]);
                  this._success = `Voice matched & added: ${results[0].description}`;
                  if (this._successTimer) clearTimeout(this._successTimer);
                  this._successTimer = setTimeout(() => { this._success = null; }, 4000);
                }
              }
            } catch (err: unknown) {
              this._error = err instanceof Error ? err.message : 'Error executing voice search';
            } finally {
              this._loading = false;
            }
          }
        };

        this._recognition.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          this._error = `Voice input error: ${event.error}`;
          this._isListening = false;
        };

        this._recognition.onend = () => {
          this._isListening = false;
        };
      }

      this._recognition.start();
    } catch (err: unknown) {
      this._error = 'Failed to start speech recognition: ' + (err instanceof Error ? err.message : 'Unknown error');
      this._isListening = false;
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

  /* ---- Customer search with debounce ---- */

  private _debounceCustomerSearch() {
    if (this._customerDebounce) clearTimeout(this._customerDebounce);

    if (this._customerQuery.length < 2) {
      this._customerResults = [];
      return;
    }

    this._customerDebounce = setTimeout(async () => {
      try {
        const results = await posService.searchCustomers(this._customerQuery);
        this._customerResults = results;
      } catch {
        this._customerResults = [];
      }
    }, 250);
  }

  private _selectCustomer(customer: { id: string; name: string; account_number: string }) {
    this._selectedCustomer = customer;
    this._customerQuery = '';
    this._customerResults = [];
  }

  private _clearCustomer() {
    this._selectedCustomer = null;
  }

  /* ---- Transaction management ---- */

  private async _startNewTransaction() {
    try {
      this._loading = true;
      this._error = null;
      this._success = null;
      this._showReceipt = false;
      this._completedTransaction = null;
      this._tenders = [];
      this._showTenderInput = false;
      let cashierId = localStorage.getItem('user_id') || '';
      if (!cashierId) {
        if (import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true') {
          cashierId = '11111111-1111-1111-1111-111111111111';
          localStorage.setItem('user_id', cashierId);
          localStorage.setItem('user_role', 'cashier');
        } else {
          this._error = 'No cashier ID found. Please log in again.';
          return;
        }
      }
      const customerID = this._selectedCustomer?.id;
      const tx = await posService.startTransaction('REG-01', cashierId, customerID);
      this._transaction = tx;
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

  private async _updateQuantity(itemId: string, newQty: number) {
    if (!this._transaction) return;
    try {
      const updated = await posService.updateItemQuantity(this._transaction.id, itemId, newQty);
      this._transaction = updated;
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : 'Failed to update quantity';
    }
  }

  /* ---- Split tender management ---- */

  private _addTender(method: string) {
    this._tenderMethod = method;
    const remaining = this._getRemainingBalance();
    this._tenderAmount = (remaining / 100).toFixed(2);
    this._showTenderInput = true;
  }

  private _confirmTender() {
    const amount = parseFloat(this._tenderAmount);
    if (isNaN(amount) || amount <= 0) {
      this._error = 'Invalid tender amount';
      return;
    }
    this._tenders = [...this._tenders, { method: this._tenderMethod, amount }];
    this._showTenderInput = false;
    this._tenderMethod = '';
    this._tenderAmount = '';
  }

  private _removeTender(index: number) {
    this._tenders = this._tenders.filter((_, i) => i !== index);
  }

  private _getRemainingBalance(): number {
    if (!this._transaction) return 0;
    const totalTendered = this._tenders.reduce((sum, t) => sum + Math.round(t.amount * 100), 0);
    return Math.max(0, this._transaction.total - totalTendered);
  }

  private async _completeSale() {
    if (!this._transaction || this._tenders.length === 0) return;
    if (this._getRemainingBalance() > 0) {
      this._error = 'Remaining balance must be $0.00 before completing sale';
      return;
    }
    try {
      this._loading = true;
      this._error = null;
      const completed = await posService.completeTransaction(this._transaction.id, this._tenders);
      this._completedTransaction = completed;
      this._transaction = completed;
      this._success = `Sale completed! Total: $${(completed.total / 100).toFixed(2)}`;
      this._showReceipt = true;
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
      this._tenders = [];
      this._startNewTransaction();
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : 'Failed to void transaction';
    }
  }

  /* ---- Transaction history ---- */

  private async _toggleHistory() {
    if (this._showHistory) {
      this._showHistory = false;
      this._historyDetail = null;
      return;
    }
    try {
      const today = new Date().toISOString().split('T')[0];
      this._historyItems = await posService.listTransactions('REG-01', today);
      this._showHistory = true;
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : 'Failed to load history';
    }
  }

  private async _viewHistoryDetail(id: string) {
    try {
      this._historyDetail = await posService.getTransaction(id);
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : 'Failed to load transaction';
    }
  }

  /* ---- Receipt printing ---- */

  private _printReceipt() {
    window.print();
  }

  private _startNewAfterReceipt() {
    this._showReceipt = false;
    this._completedTransaction = null;
    this._success = null;
    this._tenders = [];
    this._startNewTransaction();
  }

  /* ---- Render helpers ---- */

  private _renderReceipt(tx: POSTransaction) {
    const items = tx.line_items || [];
    const tenders = tx.tenders || [];
    const dateStr = tx.completed_at ? new Date(tx.completed_at).toLocaleString() : new Date().toLocaleString();

    return html`
      <div id="pos-receipt" style="max-width:320px;margin:0 auto;padding:24px;background:#fff;color:#000;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.5">
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:18px;font-weight:bold;letter-spacing:1px">GABLE LBM</div>
          <div style="font-size:10px;color:#666;margin-top:4px">Building Materials & Lumber Supply</div>
          <div style="border-bottom:1px dashed #999;margin:8px 0"></div>
          <div style="font-size:10px">${dateStr}</div>
          <div style="font-size:10px">TX: ${tx.id.slice(0, 8).toUpperCase()}</div>
          <div style="font-size:10px">REG: ${tx.register_id}</div>
        </div>
        <div style="border-bottom:1px dashed #999;margin:8px 0"></div>
        ${items.map(item => html`
          <div style="display:flex;justify-content:space-between;margin:4px 0">
            <div style="flex:1">
              <div>${item.description}</div>
              <div style="font-size:10px;color:#666">${item.quantity} x $${(item.unit_price / 100).toFixed(2)}</div>
            </div>
            <div style="font-weight:bold">$${(item.line_total / 100).toFixed(2)}</div>
          </div>
        `)}
        <div style="border-bottom:1px dashed #999;margin:8px 0"></div>
        <div style="display:flex;justify-content:space-between;margin:4px 0">
          <span>Subtotal:</span><span>$${(tx.subtotal / 100).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin:4px 0">
          <span>Tax:</span><span>$${(tx.tax_amount / 100).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin:4px 0;font-size:16px;font-weight:bold">
          <span>TOTAL:</span><span>$${(tx.total / 100).toFixed(2)}</span>
        </div>
        <div style="border-bottom:1px dashed #999;margin:8px 0"></div>
        <div style="font-size:10px;margin-bottom:4px;font-weight:bold">PAYMENT:</div>
        ${tenders.map(t => html`
          <div style="display:flex;justify-content:space-between;margin:2px 0;font-size:11px">
            <span>${t.method}</span><span>$${(t.amount / 100).toFixed(2)}</span>
          </div>
        `)}
        <div style="border-bottom:1px dashed #999;margin:12px 0"></div>
        <div style="text-align:center;font-size:11px;color:#666">
          <div>Thank you for your business!</div>
          <div style="margin-top:4px">www.gablelbm.com</div>
        </div>
      </div>
    `;
  }

  /* ---- Render ---- */

  render() {
    const totalDollars = this._transaction ? (this._transaction.total / 100).toFixed(2) : '0.00';
    const subtotalDollars = this._transaction ? (this._transaction.subtotal / 100).toFixed(2) : '0.00';
    const taxDollars = this._transaction ? (this._transaction.tax_amount / 100).toFixed(2) : '0.00';
    const lineItems: POSLineItem[] = this._transaction?.line_items || [];
    const remainingBalance = this._getRemainingBalance();
    const remainingDollars = (remainingBalance / 100).toFixed(2);
    const canComplete = this._tenders.length > 0 && remainingBalance <= 0 && lineItems.length > 0;
    const isSpeechSupported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

    return html`
      <!-- Print styles: hide everything except receipt -->
      <style>
        @media print {
          body > *:not(gable-pos-terminal) { display: none !important; }
          gable-pos-terminal > *:not(#pos-receipt-overlay) { display: none !important; }
          #pos-receipt-overlay { position: static !important; background: #fff !important; }
          #pos-receipt-overlay > *:not(#pos-receipt) { display: none !important; }
          #pos-receipt { margin: 0 !important; padding: 8px !important; box-shadow: none !important; }
        }
        @keyframes voicePulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .voice-pulse-btn {
          animation: voicePulse 1.5s infinite;
        }
      </style>

      ${this._showReceipt && this._completedTransaction ? html`
        <div id="pos-receipt-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow-y:auto">
          ${this._renderReceipt(this._completedTransaction)}
          <div style="display:flex;gap:12px;margin-top:16px" class="no-print">
            <button @click=${() => this._printReceipt()} style="padding:12px 24px;background:#00FFA3;border:none;border-radius:8px;color:#0A0B10;font-weight:700;font-size:14px;cursor:pointer">
              \u{1F5A8} Print Receipt
            </button>
            <button @click=${() => this._startNewAfterReceipt()} style="padding:12px 24px;background:#161821;border:1px solid #30363d;border-radius:8px;color:#e6edf3;font-weight:600;font-size:14px;cursor:pointer">
              New Sale
            </button>
          </div>
        </div>
      ` : nothing}

      <div style="display:flex;flex-direction:column;height:100vh;background:#0A0B10;color:#e6edf3;font-family:'Inter',-apple-system,sans-serif">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 24px;background:#161821;border-bottom:1px solid #21262d">
          <div style="display:flex;align-items:center;gap:12px">
            <h1 style="font-size:18px;font-weight:700;margin:0;color:#e6edf3">POS Terminal</h1>
            <span style="font-size:11px;padding:2px 8px;background:#00FFA3;border-radius:12px;color:#0A0B10;font-weight:600">REG-01</span>
            ${this._transaction ? html`
              <span style="font-size:11px;padding:2px 8px;background:#38BDF8;border-radius:12px;color:#0A0B10;font-family:'JetBrains Mono',monospace">
                TX: ${this._transaction.id.slice(0, 8)}
              </span>
            ` : nothing}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button @click=${() => this._toggleHistory()} style="padding:6px 14px;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px" title="Transaction History">
              \u{1F552} History
            </button>
            <button @click=${() => this._startNewTransaction()} style="padding:6px 16px;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:13px;cursor:pointer" title="New Sale (F2)">
              New Sale <span style="font-size:10px;color:#6e7681;margin-left:4px">F2</span>
            </button>
          </div>
        </div>

        <!-- Alerts -->
        ${this._error ? html`
          <div style="padding:10px 16px;background:#3d1114;border-bottom:1px solid #f8514940;color:#F43F5E;font-size:13px;display:flex;justify-content:space-between;align-items:center">
            ${this._error}
            <button @click=${() => { this._error = null; }} style="background:none;border:none;color:#F43F5E;font-size:16px;cursor:pointer" aria-label="Dismiss error">\u00d7</button>
          </div>
        ` : nothing}
        ${this._success && !this._showReceipt ? html`
          <div style="padding:10px 16px;background:#0d2818;border-bottom:1px solid #00FFA340;color:#00FFA3;font-size:14px;font-weight:600;text-align:center">
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
                  placeholder="Search product by SKU or description... (F3)"
                  .value=${this._searchQuery}
                  @input=${(e: Event) => { this._searchQuery = (e.target as HTMLInputElement).value; }}
                  style="flex:1;padding:12px 16px;background:#0A0B10;border:2px solid #30363d;border-radius:8px;color:#e6edf3;font-size:16px;outline:none;box-sizing:border-box"
                  aria-label="Search product by SKU or description"
                />
                <button
                  @click=${this._toggleVoiceSearch}
                  class=${this._isListening ? 'voice-pulse-btn' : ''}
                  ?disabled=${!isSpeechSupported}
                  style="background:${!isSpeechSupported ? '#161821' : this._isListening ? '#EF4444' : '#21262d'};border:1px solid ${!isSpeechSupported ? '#21262d' : this._isListening ? '#EF4444' : '#30363d'};border-radius:8px;color:${!isSpeechSupported ? '#484f58' : this._isListening ? '#FFF' : '#e6edf3'};padding:0 16px;cursor:${!isSpeechSupported ? 'not-allowed' : 'pointer'};font-weight:bold;display:flex;align-items:center;gap:6px;transition:all 0.2s ease"
                  title=${isSpeechSupported ? 'Voice SKU Search' : 'Voice Search not supported in this browser'}
                >
                  🎤 ${this._isListening ? 'Listening...' : 'Voice'}
                </button>
                <button
                  @click=${() => { this._isScanning = true; }}
                  style="background:#00FFA3;border:none;border-radius:8px;color:#0A0B10;padding:0 16px;cursor:pointer;font-weight:bold;display:flex;align-items:center;gap:8px"
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
                <div style="position:absolute;top:100%;left:16px;right:16px;background:#161821;border:1px solid #30363d;border-radius:8px;z-index:10;max-height:300px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.4)">
                  ${this._searchResults.map(result => html`
                    <button
                      @click=${() => this._addItem(result)}
                      style="display:flex;width:100%;padding:10px 14px;background:transparent;border:none;border-bottom:1px solid #21262d;color:#e6edf3;cursor:pointer;text-align:left;gap:12px;align-items:center;font-size:13px"
                    >
                      <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#38BDF8;min-width:100px">${result.sku}</span>
                      <span style="flex:1;color:#c9d1d9">${result.description}</span>
                      <span style="font-weight:600;color:#00FFA3;font-family:'JetBrains Mono',monospace">$${result.unit_price.toFixed(2)}/${result.uom}</span>
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
                  <p style="font-size:12px;color:#6e7681">Press <kbd style="padding:2px 6px;background:#21262d;border-radius:4px;font-size:11px">F3</kbd> or <kbd style="padding:2px 6px;background:#21262d;border-radius:4px;font-size:11px">/</kbd> to focus search</p>
                </div>
              ` : html`
                <table style="width:100%;border-collapse:collapse" aria-label="Cart items">
                  <thead>
                    <tr>
                      <th style="text-align:left;padding:8px 12px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #21262d">Item</th>
                      <th style="text-align:center;padding:8px 12px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #21262d;min-width:140px">Qty</th>
                      <th style="text-align:right;padding:8px 12px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #21262d">Price</th>
                      <th style="text-align:right;padding:8px 12px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #21262d">Total</th>
                      <th style="padding:8px 12px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #21262d;width:40px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lineItems.map((item: POSLineItem) => html`
                      <tr>
                        <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #161821">${item.description}</td>
                        <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #161821;text-align:center">
                          <div style="display:flex;align-items:center;justify-content:center;gap:6px">
                            <button
                              @click=${() => this._updateQuantity(item.id, item.quantity - 1)}
                              style="width:28px;height:28px;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0"
                              title="Decrease quantity"
                            >\u2212</button>
                            <input
                              type="number"
                              .value=${String(item.quantity)}
                              @change=${(e: Event) => {
                                const val = parseFloat((e.target as HTMLInputElement).value);
                                if (!isNaN(val)) this._updateQuantity(item.id, val);
                              }}
                              style="width:50px;text-align:center;background:#0A0B10;border:1px solid #30363d;border-radius:4px;color:#e6edf3;padding:4px;font-family:'JetBrains Mono',monospace;font-size:14px"
                              min="0"
                              step="1"
                            />
                            <button
                              @click=${() => this._updateQuantity(item.id, item.quantity + 1)}
                              style="width:28px;height:28px;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0"
                              title="Increase quantity"
                            >+</button>
                            <span style="font-size:12px;color:#8b949e;margin-left:2px">${item.uom}</span>
                          </div>
                        </td>
                        <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #161821;text-align:right;font-family:'JetBrains Mono',monospace">
                          $${(item.unit_price / 100).toFixed(2)}
                        </td>
                        <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #161821;text-align:right;font-weight:600;font-family:'JetBrains Mono',monospace">
                          $${(item.line_total / 100).toFixed(2)}
                        </td>
                        <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #161821">
                          <button
                            @click=${() => this._removeItem(item.id)}
                            style="background:none;border:none;color:#F43F5E;font-size:18px;cursor:pointer;padding:2px 6px;border-radius:4px"
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
          <div style="width:380px;display:flex;flex-direction:column;background:#161821;padding:24px;overflow-y:auto">
            <!-- Customer Lookup -->
            <div style="margin-bottom:16px;position:relative">
              ${this._selectedCustomer ? html`
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#21262d;border-radius:8px;border:1px solid #30363d">
                  <span style="font-size:14px;color:#00FFA3;font-weight:600">\u{1F464}</span>
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:600;color:#e6edf3">${this._selectedCustomer.name}</div>
                    <div style="font-size:11px;color:#8b949e;font-family:'JetBrains Mono',monospace">${this._selectedCustomer.account_number}</div>
                  </div>
                  <button @click=${() => this._clearCustomer()} style="background:none;border:none;color:#8b949e;font-size:16px;cursor:pointer;padding:2px 6px" title="Clear customer">\u00d7</button>
                </div>
              ` : html`
                <input
                  type="text"
                  placeholder="Search customer..."
                  .value=${this._customerQuery}
                  @input=${(e: Event) => { this._customerQuery = (e.target as HTMLInputElement).value; }}
                  style="width:100%;padding:8px 12px;background:#0A0B10;border:1px solid #30363d;border-radius:8px;color:#e6edf3;font-size:13px;outline:none;box-sizing:border-box"
                  aria-label="Search customer"
                />
                ${this._customerResults.length > 0 ? html`
                  <div style="position:absolute;top:100%;left:0;right:0;background:#161821;border:1px solid #30363d;border-radius:8px;z-index:10;max-height:200px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.4);margin-top:4px">
                    ${this._customerResults.map(c => html`
                      <button
                        @click=${() => this._selectCustomer(c)}
                        style="display:flex;width:100%;padding:8px 12px;background:transparent;border:none;border-bottom:1px solid #21262d;color:#e6edf3;cursor:pointer;text-align:left;gap:8px;align-items:center;font-size:13px"
                      >
                        <span style="font-weight:600;flex:1">${c.name}</span>
                        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#8b949e">${c.account_number}</span>
                      </button>
                    `)}
                  </div>
                ` : nothing}
              `}
            </div>

            <!-- Totals -->
            <div style="margin-bottom:16px">
              <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:#8b949e">
                <span>Subtotal</span>
                <span style="font-family:'JetBrains Mono',monospace">$${subtotalDollars}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:#8b949e">
                <span>Tax</span>
                <span style="font-family:'JetBrains Mono',monospace">$${taxDollars}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:16px;font-weight:700;color:#e6edf3;border-top:1px solid #30363d;margin-top:8px">
                <span>TOTAL</span>
                <span style="font-size:28px;font-weight:800;color:#00FFA3;font-family:'JetBrains Mono',monospace">$${totalDollars}</span>
              </div>
            </div>

            <!-- Applied tenders -->
            ${this._tenders.length > 0 ? html`
              <div style="margin-bottom:12px">
                <div style="font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Applied Tenders</div>
                ${this._tenders.map((t, i) => html`
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#21262d;border-radius:6px;margin-bottom:4px;font-size:13px">
                    <span style="color:#e6edf3">${t.method}</span>
                    <div style="display:flex;align-items:center;gap:8px">
                      <span style="font-family:'JetBrains Mono',monospace;color:#00FFA3;font-weight:600">$${t.amount.toFixed(2)}</span>
                      <button @click=${() => this._removeTender(i)} style="background:none;border:none;color:#F43F5E;font-size:14px;cursor:pointer;padding:0 4px" title="Remove tender">\u00d7</button>
                    </div>
                  </div>
                `)}
                <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;font-weight:600;color:${remainingBalance > 0 ? '#F43F5E' : '#00FFA3'}">
                  <span>Remaining</span>
                  <span style="font-family:'JetBrains Mono',monospace">$${remainingDollars}</span>
                </div>
              </div>
            ` : nothing}

            <!-- Tender input or buttons -->
            ${this._showTenderInput ? html`
              <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:12px">
                <div style="font-size:16px;font-weight:700;text-align:center;padding:4px;color:#e6edf3">
                  ${this._tenderMethod}
                </div>
                <input
                  type="number"
                  .value=${this._tenderAmount}
                  @input=${(e: Event) => { this._tenderAmount = (e.target as HTMLInputElement).value; }}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._confirmTender(); }}
                  style="padding:14px;background:#0A0B10;border:2px solid #00FFA3;border-radius:8px;color:#e6edf3;font-size:24px;font-weight:700;text-align:center;outline:none;font-family:'JetBrains Mono',monospace"
                  step="0.01"
                  aria-label="Tender amount"
                />
                <div style="display:flex;gap:8px">
                  <button
                    @click=${() => this._confirmTender()}
                    style="flex:1;padding:12px;background:#00FFA3;border:none;border-radius:8px;color:#0A0B10;font-size:14px;font-weight:700;cursor:pointer"
                  >Add Tender</button>
                  <button
                    @click=${() => { this._showTenderInput = false; }}
                    style="padding:12px 16px;background:transparent;border:1px solid #30363d;border-radius:8px;color:#8b949e;font-size:14px;cursor:pointer"
                  >Cancel</button>
                </div>
              </div>
            ` : html`
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                <button @click=${() => this._addTender('CASH')} style="padding:16px;background:#21262d;border:1px solid #30363d;border-radius:10px;color:#e6edf3;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.15s;text-align:center" ?disabled=${lineItems.length === 0}>
                  \u{1F4B5} Cash
                </button>
                <button @click=${() => this._addTender('CARD')} style="padding:16px;background:#21262d;border:1px solid #30363d;border-radius:10px;color:#e6edf3;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.15s;text-align:center" ?disabled=${lineItems.length === 0}>
                  \u{1F4B3} Card
                </button>
                <button @click=${() => this._addTender('CHECK')} style="padding:16px;background:#21262d;border:1px solid #30363d;border-radius:10px;color:#e6edf3;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.15s;text-align:center" ?disabled=${lineItems.length === 0}>
                  \u{1F4DD} Check
                </button>
                <button @click=${() => this._addTender('ACCOUNT')} style="padding:16px;background:#21262d;border:1px solid #30363d;border-radius:10px;color:#e6edf3;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.15s;text-align:center" ?disabled=${lineItems.length === 0}>
                  \u{1F4C1} Account
                </button>
              </div>
            `}

            <!-- Complete Sale button -->
            <button
              @click=${() => this._completeSale()}
              style="padding:16px;background:${canComplete ? '#00FFA3' : '#21262d'};border:none;border-radius:8px;color:${canComplete ? '#0A0B10' : '#6e7681'};font-size:16px;font-weight:700;cursor:${canComplete ? 'pointer' : 'not-allowed'};margin-bottom:8px;transition:all 0.15s"
              ?disabled=${!canComplete || this._loading}
            >
              ${this._loading ? 'Processing...' : `Complete Sale \u2014 $${totalDollars}`}
              <span style="font-size:10px;opacity:0.7;margin-left:6px">F12</span>
            </button>

            <!-- Quick Actions -->
            <div style="padding:8px 0;margin-top:auto;display:flex;gap:8px">
              <button
                @click=${() => this._voidTransaction()}
                style="flex:1;padding:10px;background:transparent;border:1px solid #F43F5E40;border-radius:8px;color:#F43F5E;font-size:13px;cursor:pointer"
                ?disabled=${!this._transaction || lineItems.length === 0}
                title="Void Transaction (F8)"
              >
                Void <span style="font-size:10px;color:#6e7681;margin-left:4px">F8</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Transaction History Drawer -->
      ${this._showHistory ? html`
        <div style="position:fixed;top:0;right:0;bottom:0;width:420px;background:#161821;border-left:1px solid #30363d;box-shadow:-8px 0 24px rgba(0,0,0,0.4);z-index:50;display:flex;flex-direction:column;overflow:hidden">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #21262d">
            <h2 style="font-size:16px;font-weight:700;margin:0;color:#e6edf3">Transaction History</h2>
            <button @click=${() => { this._showHistory = false; this._historyDetail = null; }} style="background:none;border:none;color:#8b949e;font-size:20px;cursor:pointer">\u00d7</button>
          </div>

          ${this._historyDetail ? html`
            <div style="flex:1;overflow-y:auto;padding:16px 20px">
              <button @click=${() => { this._historyDetail = null; }} style="background:none;border:none;color:#38BDF8;font-size:13px;cursor:pointer;padding:0;margin-bottom:12px">\u2190 Back to list</button>
              <div style="margin-bottom:12px">
                <div style="font-size:12px;color:#8b949e">Transaction</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:14px;color:#e6edf3">${this._historyDetail.id.slice(0, 8).toUpperCase()}</div>
              </div>
              <div style="display:flex;gap:12px;margin-bottom:16px">
                <div>
                  <div style="font-size:12px;color:#8b949e">Status</div>
                  <span style="font-size:12px;padding:2px 8px;border-radius:10px;font-weight:600;background:${this._historyDetail.status === 'COMPLETED' ? '#0d281850' : this._historyDetail.status === 'VOIDED' ? '#3d111450' : '#21262d'};color:${this._historyDetail.status === 'COMPLETED' ? '#00FFA3' : this._historyDetail.status === 'VOIDED' ? '#F43F5E' : '#8b949e'}">${this._historyDetail.status}</span>
                </div>
                <div>
                  <div style="font-size:12px;color:#8b949e">Total</div>
                  <div style="font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:700;color:#00FFA3">$${(this._historyDetail.total / 100).toFixed(2)}</div>
                </div>
              </div>
              <div style="font-size:12px;color:#8b949e;text-transform:uppercase;margin-bottom:8px">Items</div>
              ${(this._historyDetail.line_items || []).map(item => html`
                <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #21262d">
                  <div>
                    <div style="color:#e6edf3">${item.description}</div>
                    <div style="font-size:11px;color:#8b949e;font-family:'JetBrains Mono',monospace">${item.quantity} x $${(item.unit_price / 100).toFixed(2)}</div>
                  </div>
                  <div style="font-family:'JetBrains Mono',monospace;font-weight:600;color:#e6edf3">$${(item.line_total / 100).toFixed(2)}</div>
                </div>
              `)}
              ${(this._historyDetail.tenders || []).length > 0 ? html`
                <div style="font-size:12px;color:#8b949e;text-transform:uppercase;margin:12px 0 8px">Tenders</div>
                ${(this._historyDetail.tenders || []).map(t => html`
                  <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px">
                    <span style="color:#e6edf3">${t.method}</span>
                    <span style="font-family:'JetBrains Mono',monospace;color:#00FFA3">$${(t.amount / 100).toFixed(2)}</span>
                  </div>
                `)}
              ` : nothing}
            </div>
          ` : html`
            <div style="flex:1;overflow-y:auto">
              ${this._historyItems.length === 0 ? html`
                <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#484f58;font-size:14px">
                  No transactions today
                </div>
              ` : html`
                ${this._historyItems.map(s => html`
                  <button
                    @click=${() => this._viewHistoryDetail(s.id)}
                    style="display:flex;width:100%;padding:12px 20px;background:transparent;border:none;border-bottom:1px solid #21262d;color:#e6edf3;cursor:pointer;text-align:left;align-items:center;gap:12px"
                  >
                    <div style="flex:1">
                      <div style="font-size:13px;font-weight:600">
                        ${new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        <span style="font-size:11px;color:#8b949e;margin-left:6px">${s.item_count} item${s.item_count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;background:${s.status === 'COMPLETED' ? '#0d281850' : s.status === 'VOIDED' ? '#3d111450' : '#21262d'};color:${s.status === 'COMPLETED' ? '#00FFA3' : s.status === 'VOIDED' ? '#F43F5E' : '#8b949e'}">${s.status}</span>
                    <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600;color:#00FFA3">$${(s.total / 100).toFixed(2)}</span>
                  </button>
                `)}
              `}
            </div>
          `}
        </div>
        <!-- History backdrop -->
        <div @click=${() => { this._showHistory = false; this._historyDetail = null; }} style="position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:49"></div>
      ` : nothing}
    `;
  }
}

export default POSTerminal;
