import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../lib/icons';
import { X } from 'lucide';
import { Html5QrcodeScanner } from 'html5-qrcode';

@customElement('gable-barcode-scanner')
export class GableBarcodeScanner extends LitElement {
  createRenderRoot() { return this; }

  @state() private _error: string | null = null;
  @state() private _isScanning = false;

  private _scanner: Html5QrcodeScanner | null = null;

  connectedCallback() {
    super.connectedCallback();
    // Defer initialization until after first render
    requestAnimationFrame(() => this._initScanner());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanupScanner();
  }

  private _initScanner() {
    if (this._scanner) return;

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 150 },
      aspectRatio: 1.0,
      showTorchButtonIfSupported: true,
    };

    const container = this.querySelector('#reader-container');
    if (!container) return;

    const scanner = new Html5QrcodeScanner('reader-container', config, false);
    this._scanner = scanner;

    try {
      scanner.render(
        (decodedText: string) => {
          // Success callback
          this._cleanupScanner();
          this.dispatchEvent(new CustomEvent('scan', {
            detail: decodedText,
            bubbles: true,
            composed: true,
          }));
        },
        () => {
          // Error callback (called frequently on no match)
        }
      );
      this._isScanning = true;
    } catch (err: unknown) {
      console.error('Scanner initialization failed', err);
      this._error = err instanceof Error ? err.message : 'Failed to access camera. Please check permissions.';
    }
  }

  private _cleanupScanner() {
    if (this._scanner) {
      try {
        this._scanner.clear().catch((e: unknown) => console.error('Failed to clear on unmount', e));
      } catch {
        // Ignore clear errors on unmount
      }
      this._scanner = null;
    }
  }

  private _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private _handleBackdropClick(e: Event) {
    if (e.target === e.currentTarget) {
      this._close();
    }
  }

  render() {
    return html`
      <div
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        @click=${this._handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
      >
        <div class="bg-[#12131A] border border-white/10 rounded-xl overflow-hidden w-full max-w-md shadow-2xl flex flex-col relative animate-scale-up">
          <!-- Header -->
          <div class="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-[#0A0B10]">
            <h3 id="barcode-scanner-title" class="text-white font-medium">Scan Barcode</h3>
            <button
              @click=${this._close}
              class="text-zinc-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
              aria-label="Close barcode scanner"
            >
              ${icon(X, 20)}
            </button>
          </div>

          <!-- Body -->
          <div class="p-4 bg-black/40 min-h-[300px] flex items-center justify-center">
            ${this._error ? html`
              <div class="text-center p-4 text-rose-400 bg-rose-500/10 rounded-lg border border-rose-500/20">
                <p class="mb-2">${this._error}</p>
                <button
                  @click=${this._close}
                  class="text-sm border border-rose-500/50 px-3 py-1 rounded mt-2 hover:bg-rose-500/20 transition-colors"
                >
                  Close
                </button>
              </div>
            ` : html`
              <div class="w-full relative">
                <div id="reader-container" class="w-full overflow-hidden rounded-lg bg-black border border-white/10 [&>div]:!border-none [&>div>video]:!rounded-lg [&_button]:!bg-[#00FFA3] [&_button]:!text-black [&_button]:!border-none [&_button]:!rounded [&_button]:!px-3 [&_button]:!py-1.5 [&_button]:!font-medium [&_button]:!text-sm hover:[&_button]:!bg-[#00E593] [&_select]:!bg-[#12131A] [&_select]:!text-white [&_select]:!border-white/20 [&_select]:!rounded [&_select]:!px-2 [&_select]:!py-1 [&_select]:!text-sm [&_a]:hidden pb-2"></div>

                ${this._isScanning ? html`
                  <div class="absolute top-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs text-[#00FFA3] font-mono border border-[#00FFA3]/20">
                    <span class="w-2 h-2 rounded-full bg-[#00FFA3] animate-pulse"></span>
                    Scanning
                  </div>
                ` : nothing}
              </div>
            `}
          </div>

          <!-- Footer hint -->
          <div class="px-4 py-3 bg-[#0A0B10] border-t border-white/10 text-center">
            <p class="text-xs text-zinc-400">Position the barcode or QR code inside the frame</p>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-barcode-scanner': GableBarcodeScanner;
  }
}
