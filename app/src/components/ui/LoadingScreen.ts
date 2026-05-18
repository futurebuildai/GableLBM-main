import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('gable-loading-screen')
export class GableLoadingScreen extends LitElement {
  createRenderRoot() { return this; }

  render() {
    return html`
      <div class="fixed inset-0 bg-[#0A0B10] flex flex-col items-center justify-center z-[100]">
        <div class="relative">
          <div class="w-24 h-24 rounded-full border-4 border-white/5 border-t-gable-green animate-spin absolute inset-0"></div>
          <div class="w-24 h-24 flex items-center justify-center">
            <gable-brand-logo variant="mark" size="lg" class="text-white"></gable-brand-logo>
          </div>
        </div>

        <div class="mt-8">
          <gable-brand-logo variant="text" size="xl"></gable-brand-logo>
        </div>

        <div class="mt-4 h-1 bg-gable-green/50 rounded-full overflow-hidden" style="width:100px">
          <div class="h-full bg-gable-green w-full origin-left animate-progress"></div>
        </div>

        <p class="mt-4 text-zinc-500 font-mono text-xs uppercase tracking-widest animate-pulse">
          Initializing System...
        </p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-loading-screen': GableLoadingScreen;
  }
}
