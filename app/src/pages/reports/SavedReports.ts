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

    render() {
        if (this.loading) {
            return html`<div class="p-8">Loading reports...</div>`;
        }

        return html`
            <div class="p-8">
                <div class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold">Saved Reports</h1>
                    <a
                        href="/reports/builder"
                        class="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
                    >
                        Create New Report
                    </a>
                </div>

                ${this.error ? html`
                    <div class="bg-red-50 text-red-700 p-4 rounded mb-6">
                        ${this.error}
                    </div>
                ` : nothing}

                ${this.reports.length === 0 ? html`
                    <div class="text-center text-gray-500 py-12 bg-white rounded shadow">
                        <p>No reports saved yet.</p>
                        <a href="/reports/builder" class="text-blue-600 hover:underline mt-2 inline-block">
                            Build your first report
                        </a>
                    </div>
                ` : html`
                    <div class="bg-white shadow rounded overflow-hidden">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity Type</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                ${this.reports.map((report) => html`
                                    <tr>
                                        <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">${report.name}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">${report.entity_type}</td>
                                        <td class="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">${report.description}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                class="text-indigo-600 hover:text-indigo-900 mr-4"
                                                @click=${() => ToastService.show('Run functionality coming soon', 'info')}
                                            >
                                                Run
                                            </button>
                                            <a href="/reports/builder?id=${report.id}" class="text-blue-600 hover:text-blue-900 mr-4">
                                                Edit
                                            </a>
                                            <button
                                                @click=${() => this._handleDelete(report.id)}
                                                class="text-red-600 hover:text-red-900"
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
