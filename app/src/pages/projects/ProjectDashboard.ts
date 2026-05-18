import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ArrowLeft, AlertTriangle, ShoppingCart, Truck, FileText, Calendar } from 'lucide';
import { ProjectService } from '../../services/ProjectService.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { router } from '../../lib/router.ts';
import type { ProjectDashboardDTO, ProjectItem } from '../../types/project.ts';

@customElement('gable-project-dashboard')
export class ProjectDashboard extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private data: ProjectDashboardDTO | null = null;
    @state() private loading = true;
    @state() private error = '';

    connectedCallback() {
        super.connectedCallback();
        this._fetchDashboard();
    }

    updated(changed: Map<string, unknown>) {
        if (changed.has('routeId') && this.routeId) {
            this._fetchDashboard();
        }
    }

    private async _fetchDashboard() {
        if (!this.routeId) return;
        this.loading = true;
        this.error = '';
        try {
            const result = await ProjectService.getProjectDashboard(this.routeId);
            this.data = result;
        } catch (err) {
            this.error = err instanceof Error ? err.message : 'Failed to load project dashboard';
        } finally {
            this.loading = false;
        }
    }

    private async _handleStatusToggle() {
        if (!this.data) return;
        const newStatus = this.data.project.status === 'Active' ? 'Completed' : 'Active';
        try {
            await ProjectService.updateProject(this.data.project.id, { status: newStatus });
            this.data = {
                ...this.data,
                project: { ...this.data.project, status: newStatus }
            };
            ToastService.show(`Project marked as ${newStatus}`, 'success');
        } catch (err) {
            ToastService.show(err instanceof Error ? err.message : 'Failed to update status', 'error');
        }
    }

    private _formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }

    private _renderItemRow(item: ProjectItem, iconData: Parameters<typeof icon>[0], colorClass: string, linkPrefix: string) {
        return html`
            <div
                @click=${() => router.navigate(`/portal/${linkPrefix}/${item.id}`)}
                class="p-4 flex items-center justify-between hover:bg-white/5 border-b border-white/5 last:border-0 cursor-pointer transition-colors"
            >
                <div class="flex items-center gap-4">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-${colorClass}-500/10 text-${colorClass}-400">
                        ${icon(iconData, 16)}
                    </div>
                    <div>
                        <div class="font-medium text-white flex items-center gap-2">
                            ${item.reference || item.id.substring(0, 8).toUpperCase()}
                            <span class="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                                ${item.status.replace('_', ' ')}
                            </span>
                        </div>
                        <div class="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                            ${icon(Calendar, 12)} ${new Date(item.created_at).toLocaleDateString()}
                        </div>
                    </div>
                </div>
                ${item.total_amount !== undefined && item.total_amount > 0 ? html`
                    <div class="font-mono text-sm text-white">
                        ${this._formatCurrency(item.total_amount)}
                    </div>
                ` : nothing}
            </div>
        `;
    }

    render() {
        if (this.loading) {
            return html`
                <div class="space-y-6">
                    <div class="h-8 w-32 bg-white/5 rounded-lg animate-pulse"></div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        ${[1, 2, 3].map(() => html`
                            <div class="h-32 bg-white/5 rounded-2xl animate-pulse"></div>
                        `)}
                    </div>
                    <div class="h-64 bg-white/5 rounded-2xl animate-pulse"></div>
                </div>
            `;
        }

        if (this.error || !this.data) {
            return html`
                <div class="flex flex-col items-center justify-center h-64 text-center">
                    ${icon(AlertTriangle, 48, 'w-12 h-12 text-amber-500 mb-4')}
                    <p class="text-zinc-400 mb-4">${this.error || 'Project not found'}</p>
                    <button
                        @click=${() => router.navigate('/portal/projects')}
                        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                    >
                        ${icon(ArrowLeft, 16)} Back to Projects
                    </button>
                </div>
            `;
        }

        const { project, orders, deliveries, invoices } = this.data;
        const totalOrdersAmount = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const totalInvoicesAmount = invoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);

        return html`
            <div>
                <!-- Header -->
                <div class="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="flex items-center gap-4">
                        <button
                            @click=${() => router.navigate('/portal/projects')}
                            class="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                        >
                            ${icon(ArrowLeft, 20)}
                        </button>
                        <div>
                            <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                                ${project.name}
                            </h1>
                            <p class="text-zinc-400 text-sm mt-1">Project Dashboard</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-[10px] uppercase font-semibold tracking-wider px-2 py-1 rounded border ${project.status === 'Active'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }">
                            ${project.status}
                        </span>
                        <button
                            @click=${() => this._handleStatusToggle()}
                            class="px-4 py-2 border border-white/10 text-white text-sm font-medium rounded-lg hover:bg-white/5 transition-colors"
                        >
                            Mark ${project.status === 'Active' ? 'Completed' : 'Active'}
                        </button>
                    </div>
                </div>

                <!-- Metrics -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                        <div class="p-6">
                            <div class="flex items-center gap-4 mb-4">
                                <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                    ${icon(ShoppingCart, 20)}
                                </div>
                                <div>
                                    <h3 class="text-zinc-400 text-sm font-medium">Total Orders</h3>
                                    <div class="text-2xl font-bold text-white">${orders.length}</div>
                                </div>
                            </div>
                            <div class="text-sm text-zinc-500 border-t border-white/5 pt-3">
                                Est. Value: <span class="font-mono text-white ml-1">${this._formatCurrency(totalOrdersAmount)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                        <div class="p-6">
                            <div class="flex items-center gap-4 mb-4">
                                <div class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                                    ${icon(Truck, 20)}
                                </div>
                                <div>
                                    <h3 class="text-zinc-400 text-sm font-medium">Deliveries</h3>
                                    <div class="text-2xl font-bold text-white">${deliveries.length}</div>
                                </div>
                            </div>
                            <div class="text-sm text-zinc-500 border-t border-white/5 pt-3">
                                ${deliveries.filter(d => d.status === 'DELIVERED').length} completed deliveries
                            </div>
                        </div>
                    </div>

                    <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                        <div class="p-6">
                            <div class="flex items-center gap-4 mb-4">
                                <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                    ${icon(FileText, 20)}
                                </div>
                                <div>
                                    <h3 class="text-zinc-400 text-sm font-medium">Invoices</h3>
                                    <div class="text-2xl font-bold text-white">${invoices.length}</div>
                                </div>
                            </div>
                            <div class="text-sm text-zinc-500 border-t border-white/5 pt-3">
                                Invoiced: <span class="font-mono text-white ml-1">${this._formatCurrency(totalInvoicesAmount)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Timelines / Lists -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl flex flex-col">
                        <div class="p-4 border-b border-white/5 border-[1px] border-b-white/10 flex items-center justify-between">
                            <h3 class="font-medium text-white flex items-center gap-2">
                                ${icon(ShoppingCart, 16, 'text-blue-400')} Recent Orders
                            </h3>
                        </div>
                        ${orders.length === 0 ? html`
                            <div class="p-8 text-center text-zinc-500 h-full flex items-center justify-center">
                                No orders associated with this project.
                            </div>
                        ` : html`
                            <div class="flex-1 overflow-auto max-h-96">
                                ${orders.map(o => this._renderItemRow(o, ShoppingCart, 'blue', 'orders'))}
                            </div>
                        `}
                    </div>

                    <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl flex flex-col">
                        <div class="p-4 border-b border-white/5 border-[1px] border-b-white/10 flex items-center justify-between">
                            <h3 class="font-medium text-white flex items-center gap-2">
                                ${icon(FileText, 16, 'text-emerald-400')} Recent Invoices
                            </h3>
                        </div>
                        ${invoices.length === 0 ? html`
                            <div class="p-8 text-center text-zinc-500 h-full flex items-center justify-center">
                                No invoices associated with this project.
                            </div>
                        ` : html`
                            <div class="flex-1 overflow-auto max-h-96">
                                ${invoices.map(i => this._renderItemRow(i, FileText, 'emerald', 'invoices'))}
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }
}
