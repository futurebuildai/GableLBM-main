import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { GovernanceService } from '../../services/governance.service';
import type { RFC } from '../../types/governance';
import { ArrowLeft, Edit2, FileText, Calendar, User, Clock, CheckCircle, AlertCircle } from 'lucide';

@customElement('gable-rfc-detail')
export class GableRFCDetail extends LitElement {
  createRenderRoot() { return this; }

  @property({ attribute: 'route-id' }) routeId = '';

  @state() private _rfc: RFC | null = null;
  @state() private _loading = true;

  connectedCallback() {
    super.connectedCallback();
    if (this.routeId) {
      this._loadRFC(this.routeId);
    }
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('routeId') && this.routeId) {
      this._loadRFC(this.routeId);
    }
  }

  private async _loadRFC(id: string) {
    this._loading = true;
    try {
      const data = await GovernanceService.getRFC(id);
      this._rfc = data;
    } catch (e) {
      console.error(e);
      ToastService.show('Failed to load RFC', 'error');
    } finally {
      this._loading = false;
    }
  }

  private _statusConfig(status: string) {
    switch (status.toLowerCase()) {
      case 'approved': return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', iconData: CheckCircle };
      case 'rejected': return { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', iconData: AlertCircle };
      case 'review': return { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', iconData: Clock };
      default: return { color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', iconData: FileText };
    }
  }

  render() {
    if (this._loading) {
      return html`
        <div class="p-12 flex justify-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gable-green"></div>
        </div>
      `;
    }

    if (!this._rfc) {
      return html`<div class="p-8 text-rose-500">RFC Not Found</div>`;
    }

    const rfc = this._rfc;
    const status = this._statusConfig(rfc.status);

    return html`
      <div>
        <div class="flex flex-col lg:flex-row h-[calc(100vh-6rem)] gap-6">
          <!-- Sidebar / Meta -->
          <div class="lg:w-80 shrink-0">
            <div class="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm h-full bg-slate-steel/50 border-r border-white/5 lg:border-none">
              <div class="p-6 flex flex-col h-full">
                <button
                  @click=${() => router.navigate('/governance')}
                  class="text-zinc-400 hover:text-white flex items-center mb-8 text-sm transition-colors group"
                >
                  ${icon(ArrowLeft, 16, 'w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform')}
                  Back to Governance
                </button>

                <h1 class="text-xl font-bold text-white mb-4 leading-tight">${rfc.title}</h1>

                <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border w-fit mb-8 ${status.bg} ${status.color} ${status.border}">
                  ${icon(status.iconData, 16, 'w-4 h-4')}
                  <span class="uppercase tracking-wide text-xs">${rfc.status}</span>
                </div>

                <div class="space-y-6 flex-1">
                  <div class="flex items-start gap-3">
                    ${icon(User, 20, 'w-5 h-5 text-zinc-500 mt-0.5')}
                    <div>
                      <h3 class="text-xs uppercase text-zinc-500 font-bold mb-0.5">Author</h3>
                      <p class="text-zinc-300 text-sm">Owner Bob</p>
                    </div>
                  </div>
                  <div class="flex items-start gap-3">
                    ${icon(Calendar, 20, 'w-5 h-5 text-zinc-500 mt-0.5')}
                    <div>
                      <h3 class="text-xs uppercase text-zinc-500 font-bold mb-0.5">Created</h3>
                      <p class="text-zinc-300 text-sm font-mono">${new Date(rfc.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div class="flex items-start gap-3">
                    ${icon(Clock, 20, 'w-5 h-5 text-zinc-500 mt-0.5')}
                    <div>
                      <h3 class="text-xs uppercase text-zinc-500 font-bold mb-0.5">Last Updated</h3>
                      <p class="text-zinc-300 text-sm font-mono">${new Date(rfc.updated_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                <div class="pt-6 border-t border-white/5 space-y-3 mt-auto">
                  <button class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-gable-green text-black font-semibold rounded hover:shadow-glow">
                    ${icon(Edit2, 16, 'w-4 h-4')}
                    Edit RFC
                  </button>
                  <button class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-white/10 text-zinc-300 rounded hover:bg-white/5">
                    ${icon(FileText, 16, 'w-4 h-4')}
                    Export PDF
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Main Content (Document) -->
          <div class="flex-1 overflow-auto rounded-xl border border-white/10 bg-[#0A0B10] shadow-2xl relative">
            <div class="max-w-4xl mx-auto p-12 min-h-full">
              <div class="prose prose-invert max-w-none">
                <pre class="font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed text-sm">${rfc.content}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
