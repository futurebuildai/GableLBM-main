import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { GovernanceService } from '../../services/governance.service';
import type { RFC } from '../../types/governance';
import { Plus, GitPullRequest, FileText, CheckCircle, Clock, AlertCircle } from 'lucide';

@customElement('gable-rfc-dashboard')
export class GableRFCDashboard extends LitElement {
  createRenderRoot() { return this; }

  @state() private _rfcs: RFC[] = [];
  @state() private _loading = true;

  connectedCallback() {
    super.connectedCallback();
    this._loadRFCs();
  }

  private async _loadRFCs() {
    try {
      const data = await GovernanceService.listRFCs();
      this._rfcs = data;
    } catch (err) {
      console.error(err);
      ToastService.show('Failed to load RFCs', 'error');
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
    return html`
      <div>
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 class="text-display-large text-white flex items-center gap-3">
              ${icon(GitPullRequest, 40, 'w-10 h-10 text-gable-green')}
              Governance
            </h1>
            <p class="text-zinc-500 mt-1 max-w-2xl text-lg">
              Manage architectural decisions, RFCs, and change requests.
            </p>
          </div>
          <button
            @click=${() => router.navigate('/governance/new')}
            class="inline-flex items-center gap-2 px-4 py-2 bg-gable-green text-black font-semibold rounded hover:shadow-glow shadow-glow"
          >
            ${icon(Plus, 16, 'w-4 h-4')}
            Draft New RFC
          </button>
        </div>

        <div class="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm">
          <div class="p-0">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b border-white/5 text-zinc-400 text-xs uppercase tracking-wider font-medium bg-white/5">
                    <th class="px-6 py-4">Status</th>
                    <th class="px-6 py-4">Title / ID</th>
                    <th class="px-6 py-4">Problem Statement</th>
                    <th class="px-6 py-4 text-right">Created</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  ${this._loading ? html`
                    <tr>
                      <td colspan="4" class="px-6 py-12 text-center text-zinc-500 animate-pulse">
                        Loading RFCs...
                      </td>
                    </tr>
                  ` : this._rfcs.length === 0 ? html`
                    <tr>
                      <td colspan="4" class="px-6 py-12 text-center text-zinc-500">
                        <div class="flex flex-col items-center gap-3">
                          <div class="h-12 w-12 rounded-full bg-zinc-800/50 flex items-center justify-center">
                            ${icon(FileText, 24, 'w-6 h-6 text-zinc-600')}
                          </div>
                          <p>No RFCs found. Draft your first proposal.</p>
                        </div>
                      </td>
                    </tr>
                  ` : this._rfcs.map(rfc => {
                    const status = this._statusConfig(rfc.status);
                    return html`
                      <tr
                        @click=${() => router.navigate(`/governance/${rfc.id}`)}
                        class="group hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <td class="px-6 py-4">
                          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.bg} ${status.color} ${status.border}">
                            ${icon(status.iconData, 14, 'w-3.5 h-3.5')}
                            ${rfc.status.charAt(0).toUpperCase() + rfc.status.slice(1)}
                          </span>
                        </td>
                        <td class="px-6 py-4">
                          <div class="font-medium text-white group-hover:text-gable-green transition-colors">${rfc.title}</div>
                          <div class="text-xs text-zinc-500 font-mono mt-0.5">ID: ${rfc.id.substring(0, 8)}</div>
                        </td>
                        <td class="px-6 py-4 text-zinc-400 max-w-md truncate">
                          ${rfc.problem_statement}
                        </td>
                        <td class="px-6 py-4 text-right text-zinc-500 font-mono text-xs">
                          ${new Date(rfc.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
