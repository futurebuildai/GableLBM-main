import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ToastService } from '../../lib/toast-service.ts';
import { reportingApi } from '../../services/reportingApi';
import type { SavedReport } from '../../services/reportingApi';

@customElement('gable-saved-reports')
export class SavedReports extends LitElement {
    createRenderRoot() { return this; }

    @state() private reports: SavedReport[] = [];
    @state() private loading = true;
    @state() private error: string | null = null;

    connectedCallback() {
        super.connectedCallback();
        this._loadReports();
    }

    private async _loadReports() {
        try {
            this.loading = true;
            const data = await reportingApi.listSavedReports();
            this.reports = data || [];
            this.error = null;
        } catch (err: unknown) {
            this.error = err instanceof Error ? err.message : 'Failed to load saved reports';
        } finally {
            this.loading = false;
        }
    }

    private async _handleDelete(id: string) {
        if (!window.confirm('Are you sure you want to delete this report?')) return;
        try {
            await reportingApi.deleteSavedReport(id);
            this._loadReports();
        } catch (err: unknown) {
            ToastService.show('Failed to delete report: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
        }
    }

    private _handleRun(id: string) {
        // Navigate to builder with the report ID — the builder auto-loads and auto-runs
        window.location.href = `/reports/builder?id=${id}`;
    }

    render() {
        if (this.loading) {
            return html`<div class="p-8 text-white">Loading reports...</div>`;
        }

        return html`
            <div class="p-8">
                <div class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-white">Saved Reports</h1>
                    <a
                        href="/reports/builder"
                        class="bg-gable-green text-white px-4 py-2 rounded shadow hover:bg-gable-green/80"
                    >
                        Create New Report
                    </a>
                </div>

                ${this.error ? html`
                    <div class="bg-red-500/10 text-red-400 p-4 rounded mb-6">
                        ${this.error}
                    </div>
                ` : nothing}

                ${this.reports.length === 0 ? html`
                    <div class="text-center text-zinc-400 py-12 bg-slate-steel rounded border border-white/10">
                        <p>No reports saved yet.</p>
                        <a href="/reports/builder" class="text-gable-green hover:underline mt-2 inline-block">
                            Build your first report
                        </a>
                    </div>
                ` : html`
                    <div class="bg-slate-steel border border-white/10 rounded overflow-hidden">
                        <table class="min-w-full divide-y divide-white/5">
                            <thead class="bg-slate-steel/50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Name</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Entity Type</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Description</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                ${this.reports.map((report) => html`
                                    <tr class="hover:bg-white/5">
                                        <td class="px-6 py-4 whitespace-nowrap font-medium text-white">${report.name}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-zinc-400 capitalize">${report.entity_type}</td>
                                        <td class="px-6 py-4 text-sm text-zinc-400 truncate max-w-xs">${report.description}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                class="text-gable-green hover:text-gable-green/80 mr-4"
                                                @click=${() => this._handleRun(report.id)}
                                            >
                                                Run
                                            </button>
                                            <a href="/reports/builder?id=${report.id}" class="text-blueprint-blue hover:text-blueprint-blue/80 mr-4">
                                                Edit
                                            </a>
                                            <button
                                                @click=${() => this._handleDelete(report.id)}
                                                class="text-red-400 hover:text-red-300"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;
    }
}

export default SavedReports;
