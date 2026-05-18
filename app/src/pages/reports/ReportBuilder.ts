import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ToastService } from '../../lib/toast-service.ts';
import { reportingApi } from '../../services/reportingApi';
import type { ReportDefinition, ReportColumn, ReportFilter, ReportGrouping } from '../../services/reportingApi';

const SCHEMA_METADATA: Record<string, { label: string; fields: { name: string; type: string }[] }> = {
    invoices: {
        label: 'Invoices',
        fields: [
            { name: 'id', type: 'string' },
            { name: 'invoice_number', type: 'string' },
            { name: 'status', type: 'string' },
            { name: 'total_amount', type: 'number' },
            { name: 'created_at', type: 'date' },
            { name: 'customer_name', type: 'string' },
        ],
    },
    orders: {
        label: 'Orders',
        fields: [
            { name: 'id', type: 'string' },
            { name: 'order_number', type: 'string' },
            { name: 'status', type: 'string' },
            { name: 'total_amount', type: 'number' },
            { name: 'created_at', type: 'date' },
            { name: 'customer_name', type: 'string' },
        ],
    },
    inventory: {
        label: 'Inventory',
        fields: [
            { name: 'id', type: 'string' },
            { name: 'product_name', type: 'string' },
            { name: 'quantity', type: 'number' },
        ],
    },
};

@customElement('gable-report-builder')
export class ReportBuilder extends LitElement {
    createRenderRoot() { return this; }

    @state() private entityType = 'invoices';
    @state() private reportName = 'New Custom Report';
    @state() private columns: ReportColumn[] = [];
    @state() private filters: ReportFilter[] = [];
    @state() private groupings: ReportGrouping[] = [];
    @state() private previewData: Record<string, unknown>[] | null = null;
    @state() private loading = false;
    @state() private error: string | null = null;

    private get _availableFields() {
        return SCHEMA_METADATA[this.entityType]?.fields || [];
    }

    private _handleAddColumn(e: Event) {
        const select = e.target as HTMLSelectElement;
        const field = select.value;
        if (!field) return;
        if (!this.columns.some(c => c.field === field)) {
            this.columns = [...this.columns, { field, label: field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }];
        }
        select.value = '';
    }

    private _handleRemoveColumn(field: string) {
        this.columns = this.columns.filter(c => c.field !== field);
    }

    private _handleUpdateColumnAgg(field: string, agg: string) {
        this.columns = this.columns.map(c => c.field === field ? { ...c, aggregation: agg } : c);
    }

    private _handleAddFilter() {
        if (this._availableFields.length > 0) {
            this.filters = [...this.filters, { field: this._availableFields[0].name, operator: '=', value: '' }];
        }
    }

    private _handleUpdateFilter(index: number, key: keyof ReportFilter, value: string | number | boolean | null) {
        const newFilters = [...this.filters];
        newFilters[index] = { ...newFilters[index], [key]: value };
        this.filters = newFilters;
    }

    private _handleRemoveFilter(index: number) {
        this.filters = this.filters.filter((_, i) => i !== index);
    }

    private _handleAddGrouping(e: Event) {
        const select = e.target as HTMLSelectElement;
        const field = select.value;
        if (!field) return;
        if (!this.groupings.some(g => g.field === field)) {
            this.groupings = [...this.groupings, { field }];
        }
        select.value = '';
    }

    private _handleRemoveGrouping(field: string) {
        this.groupings = this.groupings.filter(g => g.field !== field);
    }

    private _buildDefinition(): ReportDefinition {
        return { columns: this.columns, filters: this.filters, groupings: this.groupings };
    }

    private async _handlePreview() {
        if (this.columns.length === 0) {
            this.error = 'Please select at least one column.';
            return;
        }
        this.loading = true;
        this.error = null;
        try {
            const data = await reportingApi.previewReport(this.entityType, this._buildDefinition());
            this.previewData = data;
        } catch (err: unknown) {
            this.error = err instanceof Error ? err.message : 'Failed to generate preview';
        } finally {
            this.loading = false;
        }
    }

    private async _handleExport(format: 'csv' | 'xlsx') {
        if (this.columns.length === 0) return;
        this.loading = true;
        try {
            const blob = await reportingApi.exportReport(this.entityType, format, this._buildDefinition());
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${this.reportName.replace(/\s+/g, '_')}.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            this.error = 'Export failed';
        } finally {
            this.loading = false;
        }
    }

    private async _handleSave() {
        if (this.columns.length === 0) {
            ToastService.show('Cannot save report without columns', 'error');
            return;
        }
        try {
            await reportingApi.saveReport({
                name: this.reportName,
                description: 'Auto-saved via builder',
                entity_type: this.entityType,
                definition_json: this._buildDefinition(),
            });
            ToastService.show('Report saved successfully', 'success');
        } catch (err: unknown) {
            ToastService.show('Failed to save report: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
        }
    }

    private _handleEntityTypeChange(value: string) {
        this.entityType = value;
        this.columns = [];
        this.filters = [];
        this.groupings = [];
        this.previewData = null;
    }

    render() {
        return html`
            <div class="flex flex-col h-full bg-gray-50 p-6 overflow-auto">
                <div class="flex justify-between items-center mb-6">
                    <input
                        type="text"
                        .value=${this.reportName}
                        @input=${(e: Event) => this.reportName = (e.target as HTMLInputElement).value}
                        class="text-2xl font-bold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1"
                    />
                    <div class="space-x-2">
                        <button @click=${this._handleSave} class="bg-white border border-gray-300 px-4 py-2 rounded shadow-sm hover:bg-gray-50">Save</button>
                        <button @click=${() => this._handleExport('csv')} class="bg-white border border-gray-300 px-4 py-2 rounded shadow-sm hover:bg-gray-50">Export CSV</button>
                        <button @click=${() => this._handleExport('xlsx')} class="bg-white border border-gray-300 px-4 py-2 rounded shadow-sm hover:bg-gray-50">Export XLSX</button>
                    </div>
                </div>

                <div class="grid grid-cols-12 gap-6">
                    <!-- Left Sidebar: Controls -->
                    <div class="col-span-4 space-y-6">
                        <!-- Base Entity Selection -->
                        <div class="bg-white p-4 rounded shadow-sm">
                            <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Settings</h3>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Base Data Source</label>
                            <select
                                class="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                .value=${this.entityType}
                                @change=${(e: Event) => this._handleEntityTypeChange((e.target as HTMLSelectElement).value)}
                            >
                                ${Object.entries(SCHEMA_METADATA).map(([key, meta]) => html`
                                    <option value="${key}">${meta.label}</option>
                                `)}
                            </select>
                        </div>

                        <!-- Columns -->
                        <div class="bg-white p-4 rounded shadow-sm">
                            <div class="flex justify-between items-center mb-3">
                                <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wider">Columns</h3>
                                <select @change=${this._handleAddColumn} class="text-sm border-gray-300 rounded">
                                    <option value="" disabled selected>+ Add Column</option>
                                    ${this._availableFields.map(f => html`<option value="${f.name}">${f.name}</option>`)}
                                </select>
                            </div>
                            ${this.columns.length === 0 ? html`<p class="text-xs text-gray-500 italic">No columns selected.</p>` : nothing}
                            <ul class="space-y-2">
                                ${this.columns.map((col) => html`
                                    <li class="flex items-center justify-between text-sm bg-gray-50 p-2 rounded border border-gray-100">
                                        <span class="font-medium text-gray-800">${col.label}</span>
                                        <div class="flex items-center space-x-2">
                                            <select
                                                class="text-xs py-1 border-gray-300 rounded"
                                                .value=${col.aggregation || ''}
                                                @change=${(e: Event) => this._handleUpdateColumnAgg(col.field, (e.target as HTMLSelectElement).value)}
                                            >
                                                <option value="">No Aggregation</option>
                                                <option value="SUM">Sum</option>
                                                <option value="COUNT">Count</option>
                                                <option value="AVG">Average</option>
                                            </select>
                                            <button @click=${() => this._handleRemoveColumn(col.field)} class="text-red-500 hover:text-red-700">x</button>
                                        </div>
                                    </li>
                                `)}
                            </ul>
                        </div>

                        <!-- Filters -->
                        <div class="bg-white p-4 rounded shadow-sm">
                            <div class="flex justify-between items-center mb-3">
                                <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wider">Filters</h3>
                                <button @click=${this._handleAddFilter} class="text-sm text-blue-600 hover:text-blue-800 font-medium">+ Add Filter</button>
                            </div>
                            ${this.filters.length === 0 ? html`<p class="text-xs text-gray-500 italic">No filters applied.</p>` : nothing}
                            <div class="space-y-3">
                                ${this.filters.map((filter, idx) => html`
                                    <div class="flex flex-col space-y-2 bg-gray-50 p-2 rounded border border-gray-100 relative">
                                        <button @click=${() => this._handleRemoveFilter(idx)} class="absolute top-1 right-2 text-red-500 hover:text-red-700 text-lg">x</button>
                                        <select
                                            .value=${filter.field}
                                            @change=${(e: Event) => this._handleUpdateFilter(idx, 'field', (e.target as HTMLSelectElement).value)}
                                            class="text-sm border-gray-300 rounded w-full pr-6"
                                        >
                                            ${this._availableFields.map(f => html`<option value="${f.name}">${f.name}</option>`)}
                                        </select>
                                        <div class="flex space-x-2">
                                            <select
                                                .value=${filter.operator}
                                                @change=${(e: Event) => this._handleUpdateFilter(idx, 'operator', (e.target as HTMLSelectElement).value)}
                                                class="text-sm border-gray-300 rounded w-1/3"
                                            >
                                                <option value="=">=</option>
                                                <option value="!=">!=</option>
                                                <option value=">">&gt;</option>
                                                <option value="<">&lt;</option>
                                                <option value="LIKE">Contains</option>
                                            </select>
                                            <input
                                                type="text"
                                                .value=${filter.value != null ? String(filter.value) : ''}
                                                @input=${(e: Event) => this._handleUpdateFilter(idx, 'value', (e.target as HTMLInputElement).value)}
                                                placeholder="Value..."
                                                class="text-sm border-gray-300 rounded w-2/3"
                                            />
                                        </div>
                                    </div>
                                `)}
                            </div>
                        </div>

                        <!-- Groupings -->
                        <div class="bg-white p-4 rounded shadow-sm border-l-4 border-indigo-400">
                            <div class="flex justify-between items-center mb-3">
                                <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wider">Group By</h3>
                                <select @change=${this._handleAddGrouping} class="text-sm border-gray-300 rounded">
                                    <option value="" disabled selected>+ Add Grouping</option>
                                    ${this._availableFields.map(f => html`<option value="${f.name}">${f.name}</option>`)}
                                </select>
                            </div>
                            ${this.groupings.length === 0 ? html`<p class="text-xs text-gray-500 italic">No groupings applied.</p>` : nothing}
                            <div class="flex flex-wrap gap-2">
                                ${this.groupings.map(g => html`
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                        ${g.field}
                                        <button
                                            @click=${() => this._handleRemoveGrouping(g.field)}
                                            class="flex-shrink-0 ml-1.5 h-4 w-4 rounded-full inline-flex items-center justify-center text-indigo-400 hover:bg-indigo-200 hover:text-indigo-500"
                                        >
                                            <span class="sr-only">Remove grouping</span>
                                            x
                                        </button>
                                    </span>
                                `)}
                            </div>
                            ${this.groupings.length > 0 ? html`<p class="text-xs text-indigo-600 mt-2">Note: Ensure un-grouped columns use an aggregation like SUM or COUNT.</p>` : nothing}
                        </div>
                    </div>

                    <!-- Right Content Area: Preview -->
                    <div class="col-span-8">
                        <div class="bg-white rounded shadow-sm border border-gray-200 h-full flex flex-col">
                            <div class="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                                <h2 class="text-lg font-medium text-gray-800">Data Preview</h2>
                                <button
                                    @click=${this._handlePreview}
                                    ?disabled=${this.loading || this.columns.length === 0}
                                    class="px-4 py-2 rounded text-white font-medium ${this.loading || this.columns.length === 0 ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}"
                                >
                                    ${this.loading ? 'Running...' : 'Run Report'}
                                </button>
                            </div>

                            <div class="flex-1 p-4 overflow-auto">
                                ${this.error ? html`
                                    <div class="bg-red-50 text-red-700 p-4 rounded mb-4">${this.error}</div>
                                ` : nothing}

                                ${!this.previewData ? html`
                                    <div class="h-full flex items-center justify-center text-gray-400">
                                        <p>Select columns and click Run Report to preview data (Limit 50 rows).</p>
                                    </div>
                                ` : this.previewData.length === 0 ? html`
                                    <div class="h-full flex items-center justify-center text-gray-500">
                                        No records found matching criteria.
                                    </div>
                                ` : html`
                                    <div class="overflow-x-auto">
                                        <table class="min-w-full divide-y divide-gray-200 border border-gray-200">
                                            <thead class="bg-gray-50">
                                                <tr>
                                                    ${this.columns.map((col) => html`
                                                        <th class="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                                                            ${col.label} ${col.aggregation ? `(${col.aggregation})` : ''}
                                                        </th>
                                                    `)}
                                                </tr>
                                            </thead>
                                            <tbody class="bg-white divide-y divide-gray-200">
                                                ${this.previewData.slice(0, 50).map((row) => html`
                                                    <tr class="hover:bg-gray-50">
                                                        ${this.columns.map((col) => html`
                                                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                ${row[col.field] !== null ? String(row[col.field]) : '-'}
                                                            </td>
                                                        `)}
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                        ${this.previewData.length >= 50 ? html`
                                            <div class="mt-4 text-center text-sm text-gray-500 italic">
                                                Preview limited to 50 rows. Export to see full results.
                                            </div>
                                        ` : nothing}
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

export default ReportBuilder;
