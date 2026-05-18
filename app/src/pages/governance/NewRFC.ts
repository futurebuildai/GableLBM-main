import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { GovernanceService } from '../../services/governance.service';

@customElement('gable-new-rfc')
export class GableNewRFC extends LitElement {
  createRenderRoot() { return this; }

  @state() private _loading = false;
  @state() private _title = '';
  @state() private _problemStatement = '';
  @state() private _proposedSolution = '';

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    this._loading = true;
    try {
      await GovernanceService.createRFC({
        title: this._title,
        problem_statement: this._problemStatement,
        proposed_solution: this._proposedSolution,
      });
      router.navigate('/governance');
    } catch (err) {
      console.error(err);
      ToastService.show('Failed to create RFC', 'error');
    } finally {
      this._loading = false;
    }
  }

  render() {
    return html`
      <div class="p-6 max-w-4xl mx-auto">
        <div class="mb-8">
          <h1 class="text-3xl font-bold text-white mb-2">New RFC Draft</h1>
          <p class="text-slate-400">Describe the problem. The AI Governance Layer will generate the structure.</p>
        </div>

        <form @submit=${this._handleSubmit} class="space-y-6">
          <div class="space-y-2">
            <label class="text-sm font-medium text-slate-300">Title</label>
            <input
              type="text"
              required
              class="w-full bg-[#0A0B10] border border-white/20 rounded p-3 text-white focus:border-[#00FFA3] outline-none"
              placeholder="e.g. Implement Zero Trust Auth"
              .value=${this._title}
              @input=${(e: Event) => { this._title = (e.target as HTMLInputElement).value; }}
            />
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-slate-300">Problem Statement</label>
            <textarea
              required
              rows="4"
              class="w-full bg-[#0A0B10] border border-white/20 rounded p-3 text-white focus:border-[#00FFA3] outline-none"
              placeholder="What is broken or missing? Why is this important now?"
              .value=${this._problemStatement}
              @input=${(e: Event) => { this._problemStatement = (e.target as HTMLTextAreaElement).value; }}
            ></textarea>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-slate-300">Proposed Solution (High Level)</label>
            <textarea
              required
              rows="4"
              class="w-full bg-[#0A0B10] border border-white/20 rounded p-3 text-white focus:border-[#00FFA3] outline-none"
              placeholder="Briefly describe the approach..."
              .value=${this._proposedSolution}
              @input=${(e: Event) => { this._proposedSolution = (e.target as HTMLTextAreaElement).value; }}
            ></textarea>
          </div>

          <div class="pt-4 flex items-center space-x-4">
            <button
              type="button"
              @click=${() => router.navigate('/governance')}
              class="px-6 py-3 border border-white/10 text-white rounded hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              ?disabled=${this._loading}
              class="px-6 py-3 bg-[#00FFA3] text-black font-bold rounded hover:shadow-[0_0_15px_rgba(0,255,163,0.3)] disabled:opacity-50"
            >
              ${this._loading ? 'Generating...' : 'Generate Draft'}
            </button>
          </div>
        </form>
      </div>
    `;
  }
}
