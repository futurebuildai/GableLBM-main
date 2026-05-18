import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { X, Keyboard } from 'lucide';

@customElement('gable-shortcuts-modal')
export class GableShortcutsModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean }) open = false;

  private _close() {
    this.dispatchEvent(new Event('close', { bubbles: true, composed: true }));
  }

  private _shortcutItem(keys: string[], description: string) {
    return html`
      <div class="flex items-center justify-between group">
        <span class="text-zinc-300 text-sm group-hover:text-white transition-colors">${description}</span>
        <div class="flex items-center gap-1">
          ${keys.map((k, i) => html`
            <div class="flex items-center">
              <kbd class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-white min-w-[24px] text-center">${k}</kbd>
              ${i < keys.length - 1 ? html`<span class="text-zinc-600 mx-1">+</span>` : nothing}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  render() {
    if (!this.open) return nothing;

    return html`
      <div class="relative z-50">
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm" @click=${this._close}></div>
        <div class="fixed inset-0 flex items-center justify-center p-4">
          <div class="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-slate-steel border border-white/10 p-6 text-left shadow-xl">
            <div class="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
              <h3 class="text-xl font-bold font-mono text-white flex items-center gap-2">
                ${icon(Keyboard, 20, 'text-gable-green')} Keyboard Shortcuts
              </h3>
              <button @click=${this._close} aria-label="Close shortcuts" class="text-zinc-400 hover:text-white transition-colors">
                ${icon(X, 24)}
              </button>
            </div>

            <div class="grid grid-cols-2 gap-8">
              <div>
                <h4 class="text-sm font-bold text-gable-green uppercase tracking-wider mb-4">Global</h4>
                <div class="space-y-3">
                  ${this._shortcutItem(['⌘', 'K'], 'Open Omnibar (Search)')}
                  ${this._shortcutItem(['?'], 'Show Shortcuts')}
                </div>
              </div>
              <div>
                <h4 class="text-sm font-bold text-gable-green uppercase tracking-wider mb-4">Navigation</h4>
                <div class="space-y-3">
                  ${this._shortcutItem(['G', 'D'], 'Go to Dashboard')}
                  ${this._shortcutItem(['G', 'I'], 'Go to Inventory')}
                  ${this._shortcutItem(['G', 'O'], 'Go to Orders')}
                </div>
              </div>
              <div>
                <h4 class="text-sm font-bold text-gable-green uppercase tracking-wider mb-4">Quote Builder</h4>
                <div class="space-y-3">
                  ${this._shortcutItem(['Enter'], 'Add Item')}
                  ${this._shortcutItem(['⌘', 'S'], 'Save Quote')}
                </div>
              </div>
            </div>

            <div class="mt-8 pt-4 border-t border-white/10 text-center text-zinc-500 text-xs">
              Pro Tip: Keep your hands on the keyboard for maximum speed.
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
