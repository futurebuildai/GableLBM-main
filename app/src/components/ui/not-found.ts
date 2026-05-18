import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('gable-not-found')
export class GableNotFound extends LitElement {
  createRenderRoot() { return this; }

  render() {
    return html`
      <div class="flex h-[60vh] w-full items-center justify-center text-white">
        <div class="text-center">
          <h1 class="text-4xl font-bold font-mono mb-2">404</h1>
          <p class="text-zinc-400 mb-4">Page not found</p>
          <a href="/" class="text-gable-green hover:underline">Go to Dashboard</a>
        </div>
      </div>
    `;
  }
}
