import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ToastService, type ToastDetail, type ToastType } from '../../lib/toast-service.ts';

@customElement('gable-toast-container')
export class GableToastContainer extends LitElement {
  createRenderRoot() { return this; }

  @state() private _toasts: ToastDetail[] = [];
  private _timers = new Map<string, ReturnType<typeof setTimeout>>();

  connectedCallback() {
    super.connectedCallback();
    ToastService.addEventListener('toast', this._onToast as EventListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    ToastService.removeEventListener('toast', this._onToast as EventListener);
    this._timers.forEach(t => clearTimeout(t));
    this._timers.clear();
  }

  private _onToast = (e: CustomEvent<ToastDetail>) => {
    const toast = e.detail;
    this._toasts = [...this._toasts, toast];

    const timerId = setTimeout(() => {
      this._removeToast(toast.id);
    }, 5000);
    this._timers.set(toast.id, timerId);
  };

  private _removeToast(id: string) {
    const timerId = this._timers.get(id);
    if (timerId) {
      clearTimeout(timerId);
      this._timers.delete(id);
    }
    this._toasts = this._toasts.filter(t => t.id !== id);
  }

  private _iconSvg(type: ToastType) {
    switch (type) {
      case 'success':
        return html`<svg class="w-5 h-5 text-gable-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
      case 'error':
        return html`<svg class="w-5 h-5 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
      case 'info':
        return html`<svg class="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }
  }

  private _bgClass(type: ToastType) {
    return {
      success: 'border-gable-green/20 bg-gable-green/10',
      error: 'border-rose-500/20 bg-rose-500/10',
      info: 'border-blue-500/20 bg-blue-500/10',
    }[type];
  }

  render() {
    if (this._toasts.length === 0) return nothing;

    return html`
      <div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
        ${this._toasts.map(toast => html`
          <div class="min-w-[300px] p-4 rounded-lg border backdrop-blur-md shadow-2xl flex items-start gap-3 bg-[#161821]/90 ${this._bgClass(toast.type)} animate-fade-in">
            <div class="mt-0.5 shrink-0">${this._iconSvg(toast.type)}</div>
            <div class="flex-1 text-sm font-medium text-white">${toast.message}</div>
            <button @click=${() => this._removeToast(toast.id)} class="text-zinc-500 hover:text-white transition-colors">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        `)}
      </div>
    `;
  }
}
