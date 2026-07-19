/**
 * Rendered in place of a page whose owning app is disabled. The backend
 * gates the API regardless (404 app_disabled); this panel is the friendly
 * front-of-house version.
 */
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { Ban } from 'lucide';

@customElement('gable-app-disabled')
export class GableAppDisabled extends LitElement {
  createRenderRoot() {
    return this;
  }

  @property({ attribute: 'app-name' }) appName = 'This app';

  render() {
    return html`
      <div class="flex flex-col items-center justify-center py-24 text-center">
        <div class="h-14 w-14 rounded-2xl bg-slate-steel border border-white/10 flex items-center justify-center text-zinc-500 mb-4">
          ${icon(Ban, 28)}
        </div>
        <h1 class="text-xl font-semibold text-white mb-1">${this.appName} is disabled</h1>
        <p class="text-sm text-zinc-400 max-w-md">
          This app is turned off on this instance. An administrator can enable
          it from the Apps page.
        </p>
        <a
          href="/admin/apps"
          class="mt-6 inline-flex items-center gap-2 rounded-lg bg-gable-green/10 px-4 py-2 text-sm font-medium text-gable-green shadow-[inset_0_0_0_1px_rgba(0,255,163,0.2)] hover:bg-gable-green/20 transition-colors"
        >
          Manage apps
        </a>
      </div>
    `;
  }
}
