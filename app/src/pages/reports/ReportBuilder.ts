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
    customers: {
        label: 'Customers',
        fields: [
            { name: 'id', type: 'string' },
            { name: 'name', type: 'string' },
            { name: 'account_number', type: 'string' },
            { name: 'email', type: 'string' },
            { name: 'phone', type: 'string' },
            { name: 'city', type: 'string' },
            { name: 'state', type: 'string' },
            { name: 'credit_limit', type: 'number' },
            { name: 'balance_due', type: 'number' },
            { name: 'status', type: 'string' },
            { name: 'created_at', type: 'date' },
        ],
    },
    products: {
        label: 'Products',
        fields: [
            { name: 'id', type: 'string' },
            { name: 'sku', type: 'string' },
            { name: 'description', type: 'string' },
            { name: 'category', type: 'string' },
            { name: 'unit_price', type: 'number' },
            { name: 'cost', type: 'number' },
            { name: 'vendor_name', type: 'string' },
            { name: 'uom', type: 'string' },
            { name: 'created_at', type: 'date' },
        ],
    },
    payments: {
        label: 'Payments',
        fields: [
            { name: 'id', type: 'string' },
            { name: 'invoice_id', type: 'string' },
            { name: 'amount', type: 'number' },
            { name: 'method', type: 'string' },
            { name: 'status', type: 'string' },
            { name: 'reference', type: 'string' },
            { name: 'created_at', type: 'date' },
        ],
    },
    purchase_orders: {
        label: 'Purchase Orders',
        fields: [
            { name: 'id', type: 'string' },
            { name: 'po_number', type: 'string' },
            { name: 'vendor_name', type: 'string' },
            { name: 'status', type: 'string' },
            { name: 'total_amount', type: 'number' },
            { name: 'order_date', type: 'date' },
            { name: 'expected_date', type: 'date' },
            { name: 'created_at', type: 'date' },
        ],
    },
};

/** Number-type fields that should render with JetBrains Mono (font-mono). */
const NUMERIC_FIELDS = new Set([
    'total_amount', 'quantity', 'credit_limit', 'balance_due',
    'unit_price', 'cost', 'amount',
]);

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

    async connectedCallback() {
        super.connectedCallback();

        // Load saved report if ?id= param present
        const params = new URLSearchParams(window.location.search);
        const savedId = params.get('id');
        if (savedId) {
            try {
                const saved = await reportingApi.getSavedReport(savedId);
                this.entityType = saved.entity_type;
                this.reportName = saved.name;

                const def = saved.definition_json;
                if (def) {
                    this.columns = def.columns || [];
                    this.filters = def.filters || [];
                    this.groupings = def.groupings || [];
                }

                // Auto-run the preview
                if (this.columns.length > 0) {
                    await this._handlePreview();
                }
            } catch (err: unknown) {
                this.error = 'Failed to load saved report: ' + (err instanceof Error ? err.message : 'Unknown error');
            }
        }
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

    private async _handleExport(format: 'csv' | 'xlsx' | 'pdf') {
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

    /** Returns true if the field contains numeric data (for font-mono styling). */
    private _isNumericField(fieldName: string): boolean {
        return NUMERIC_FIELDS.has(fieldName);
    }

    render() {
        return html`
            <div class="flex flex-col h-full bg-deep-space p-6 overflow-auto">
                <div class="flex justify-between items-center mb-6">
                    <input
                        type="text"
                        .value=${this.reportName}
                        @input=${(e: Event) => this.reportName = (e.target as HTMLInputElement).value}
                        class="text-2xl font-bold bg-transparent border-b border-transparent hover:border-white/20 focus:border-gable-green focus:outline-none px-1 text-white"
                    />
                    <div class="space-x-2">
                        <button @click=${this._handleSave} class="bg-slate-steel border border-white/10 px-4 py-2 rounded shadow-sm hover:bg-white/5 text-white">Save</button>
                        <button @click=${() => this._handleExport('csv')} class="bg-slate-steel border border-white/10 px-4 py-2 rounded shadow-sm hover:bg-white/5 text-white">Export CSV</button>
                        <button @click=${() => this._handleExport('xlsx')} class="bg-slate-steel border border-white/10 px-4 py-2 rounded shadow-sm hover:bg-white/5 text-white">Export XLSX</button>
                        <button @click=${() => this._handleExport('pdf')} class="bg-slate-steel border border-white/10 px-4 py-2 rounded shadow-sm hover:bg-white/5 text-white">Export PDF</button>
                    </div>
                </div>

                <div class="grid grid-cols-12 gap-6">
                    <!-- Left Sidebar: Controls -->
                    <div class="col-span-4 space-y-6">
                        <!-- Base Entity Selection -->
                        <div class="bg-slate-steel p-4 rounded border border-white/10">
                            <h3 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Settings</h3>
                            <label class="block text-sm font-medium text-zinc-400 mb-1">Base Data Source</label>
                            <select
                                class="w-full bg-slate-steel/50 border border-white/10 text-white rounded-md shadow-sm focus:border-gable-green focus:ring-gable-green/50"
                                .value=${this.entityType}
                                @change=${(e: Event) => this._handleEntityTypeChange((e.target as HTMLSelectElement).value)}
                            >
                                ${Object.entries(SCHEMA_METADATA).map(([key, meta]) => html`
                                    <option value="${key}">${meta.label}</option>
                                `)}
                            </select>
                        </div>

                        <!-- Columns -->
                        <div class="bg-slate-steel p-4 rounded border border-white/10">
                            <div class="flex justify-between items-center mb-3">
                                <h3 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Columns</h3>
                                <select @change=${this._handleAddColumn} class="text-sm bg-slate-steel/50 border border-white/10 text-white rounded">
                                    <option value="" disabled selected>+ Add Column</option>
                                    ${this._availableFields.map(f => html`<option value="${f.name}">${f.name}</option>`)}
                                </select>
                            </div>
                            ${this.columns.length === 0 ? html`<p class="text-xs text-zinc-400 italic">No columns selected.</p>` : nothing}
                            <ul class="space-y-2">
                                ${this.columns.map((col) => html`
                                    <li class="flex items-center justify-between text-sm bg-white/5 p-2 rounded border border-white/10">
                                        <span class="font-medium text-white">${col.label}</span>
                                        <div class="flex items-center space-x-2">
                                            <select
                                                class="text-xs py-1 bg-slate-steel/50 border border-white/10 text-white rounded"
                                                .value=${col.aggregation || ''}
                                                @change=${(e: Event) => this._handleUpdateColumnAgg(col.field, (e.target as HTMLSelectElement).value)}
                                            >
                                                <option value="">No Aggregation</option>
                                                <option value="SUM">Sum</option>
                                                <option value="COUNT">Count</option>
                                                <option value="AVG">Average</option>
                                            </select>
                                            <button @click=${() => this._handleRemoveColumn(col.field)} class="text-red-400 hover:text-red-300">x</button>
                                        </div>
                                    </li>
                                `)}
                            </ul>
                        </div>

                        <!-- Filters -->
                        <div class="bg-slate-steel p-4 rounded border border-white/10">
                            <div class="flex justify-between items-center mb-3">
                                <h3 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Filters</h3>
                                <button @click=${this._handleAddFilter} class="text-sm text-gable-green hover:text-gable-green/80 font-medium">+ Add Filter</button>
                            </div>
                            ${this.filters.length === 0 ? html`<p class="text-xs text-zinc-400 italic">No filters applied.</p>` : nothing}
                            <div class="space-y-3">
                                ${this.filters.map((filter, idx) => html`
                                    <div class="flex flex-col space-y-2 bg-white/5 p-2 rounded border border-white/10 relative">
                                        <button @click=${() => this._handleRemoveFilter(idx)} class="absolute top-1 right-2 text-red-400 hover:text-red-300 text-lg">x</button>
                                        <select
                                            .value=${filter.field}
                                            @change=${(e: Event) => this._handleUpdateFilter(idx, 'field', (e.target as HTMLSelectElement).value)}
                                            class="text-sm bg-slate-steel/50 border border-white/10 text-white rounded w-full pr-6"
                                        >
                                            ${this._availableFields.map(f => html`<option value="${f.name}">${f.name}</option>`)}
                                        </select>
                                        <div class="flex space-x-2">
                                            <select
                                                .value=${filter.operator}
                                                @change=${(e: Event) => this._handleUpdateFilter(idx, 'operator', (e.target as HTMLSelectElement).value)}
                                                class="text-sm bg-slate-steel/50 border border-white/10 text-white rounded w-1/3"
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
                                                class="text-sm bg-slate-steel/50 border border-white/10 text-white rounded w-2/3 placeholder-zinc-500"
                                            />
                                        </div>
                                    </div>
                                `)}
                            </div>
                        </div>

                        <!-- Groupings -->
                        <div class="bg-slate-steel p-4 rounded border-l-4 border-gable-green/30 border border-white/10">
                            <div class="flex justify-between items-center mb-3">
                                <h3 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Group By</h3>
                                <select @change=${this._handleAddGrouping} class="text-sm bg-slate-steel/50 border border-white/10 text-white rounded">
                                    <option value="" disabled selected>+ Add Grouping</option>
                                    ${this._availableFields.map(f => html`<option value="${f.name}">${f.name}</option>`)}
                                </select>
                            </div>
                            ${this.groupings.length === 0 ? html`<p class="text-xs text-zinc-400 italic">No groupings applied.</p>` : nothing}
                            <div class="flex flex-wrap gap-2">
                                ${this.groupings.map(g => html`
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gable-green/10 text-gable-green">
                                        ${g.field}
                                        <button
                                            @click=${() => this._handleRemoveGrouping(g.field)}
                                            class="flex-shrink-0 ml-1.5 h-4 w-4 rounded-full inline-flex items-center justify-center text-gable-green/60 hover:bg-gable-green/20 hover:text-gable-green"
                                        >
                                            <span class="sr-only">Remove grouping</span>
                                            x
                                        </button>
                                    </span>
                                `)}
                            </div>
                            ${this.groupings.length > 0 ? html`<p class="text-xs text-gable-green/70 mt-2">Note: Ensure un-grouped columns use an aggregation like SUM or COUNT.</p>` : nothing}
                        </div>
                    </div>

                    <!-- Right Content Area: Preview -->
                    <div class="col-span-8">
                        <div class="bg-slate-steel rounded border border-white/10 h-full flex flex-col">
                            <div class="p-4 border-b border-white/10 flex justify-between items-center bg-slate-steel/50">
                                <h2 class="text-lg font-medium text-white">Data Preview</h2>
                                <button
                                    @click=${this._handlePreview}
                                    ?disabled=${this.loading || this.columns.length === 0}
                                    class="px-4 py-2 rounded text-white font-medium ${this.loading || this.columns.length === 0 ? 'bg-gable-green/50 cursor-not-allowed' : 'bg-gable-green hover:bg-gable-green/80 shadow-sm'}"
                                >
                                    ${this.loading ? 'Running...' : 'Run Report'}
                                </button>
                            </div>

                            <div class="flex-1 p-4 overflow-auto">
                                ${this.error ? html`
                                    <div class="bg-red-500/10 text-red-400 p-4 rounded mb-4">${this.error}</div>
                                ` : nothing}

                                ${!this.previewData ? html`
                                    <div class="h-full flex items-center justify-center text-zinc-400">
                                        <p>Select columns and click Run Report to preview data (Limit 50 rows).</p>
                                    </div>
                                ` : this.previewData.length === 0 ? html`
                                    <div class="h-full flex items-center justify-center text-zinc-400">
                                        No records found matching criteria.
                                    </div>
                                ` : html`
                                    <div class="overflow-x-auto">
                                        <table class="min-w-full divide-y divide-white/5 border border-white/10">
                                            <thead class="bg-slate-steel/50">
                                                <tr>
                                                    ${this.columns.map((col) => html`
                                                        <th class="px-6 py-3 text-left text-xs font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap">
                                                            ${col.label} ${col.aggregation ? `(${col.aggregation})` : ''}
                                                        </th>
                                                    `)}
                                                </tr>
                                            </thead>
                                            <tbody class="divide-y divide-white/5">
                                                ${this.previewData.slice(0, 50).map((row) => html`
                                                    <tr class="hover:bg-white/5">
                                                        ${this.columns.map((col) => html`
                                                            <td class="px-6 py-4 whitespace-nowrap text-sm text-zinc-400 ${this._isNumericField(col.field) ? 'font-mono' : ''}">
                                                                ${row[col.field] !== null ? String(row[col.field]) : '-'}
                                                            </td>
                                                        `)}
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                        ${this.previewData.length >= 50 ? html`
                                            <div class="mt-4 text-center text-sm text-zinc-400 italic">
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
