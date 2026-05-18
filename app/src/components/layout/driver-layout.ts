import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('gable-driver-layout')
export class GableDriverLayout extends LitElement {
  createRenderRoot() { return this; }

  @property({ attribute: false }) pageContent: unknown = nothing;

  render() {
    return html`
      <div class="min-h-screen bg-[#0A0B10] text-white font-sans md:max-w-md md:mx-auto md:border-x md:border-white/10 relative shadow-2xl">
        <header class="h-16 flex items-center justify-between px-4 border-b border-white/10 bg-[#161821]/80 backdrop-blur-md sticky top-0 z-50">
          <div class="font-bold text-lg tracking-wider font-mono">
            GABLE<span class="text-[#00FFA3]">DRIVER</span>
          </div>
          <div class="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-mono">
            D1
          </div>
        </header>
        <main class="pb-8">
          ${this.pageContent}
        </main>
      </div>
    `;
  }
}
