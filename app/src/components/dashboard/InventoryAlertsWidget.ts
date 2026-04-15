import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { AlertTriangle, Package } from 'lucide';
import type { InventoryAlert } from '../../types/dashboard.ts';

@customElement('gable-inventory-alerts-widget')
export class GableInventoryAlertsWidget extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: false }) alerts: InventoryAlert[] = [];
    @property({ type: Boolean }) loading = false;

    render() {
        if (this.loading) {
            return html`
                <div class="rounded-xl border border-white/10 bg-slate-steel/30 backdrop-blur-sm h-full">
                    <div class="p-4 border-b border-white/5">
                        <div class="h-6 w-32 bg-white/10 rounded animate-pulse"></div>
                    </div>
                    <div class="p-4">
                        <div class="space-y-4">
                            ${[1, 2, 3].map(() => html`
                                <div class="flex gap-4">
                                    <div class="h-10 w-10 bg-white/10 rounded animate-pulse shrink-0"></div>
                                    <div class="space-y-2 flex-1">
                                        <div class="h-4 w-3/4 bg-white/10 rounded animate-pulse"></div>
                                        <div class="h-3 w-1/2 bg-white/10 rounded animate-pulse"></div>
                                    </div>
                                </div>
                            `)}
                        </div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="rounded-xl border border-white/10 bg-slate-steel/30 backdrop-blur-sm h-full">
                <div class="p-4 border-b border-white/5">
                    <h3 class="text-base font-semibold text-white flex items-center gap-2">
                        ${icon(AlertTriangle, 20, 'w-5 h-5 text-amber-500')}
                        Inventory Alerts
                    </h3>
                </div>
                <div class="p-0">
                    <div class="divide-y divide-white/5">
                        ${this.alerts.length === 0
                            ? html`
                                <div class="p-8 text-center flex flex-col items-center gap-3">
                                    <div class="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                        ${icon(Package, 24, 'w-6 h-6 text-emerald-500')}
                                    </div>
                                    <p class="text-zinc-500">All inventory levels healthy</p>
                                </div>
                            `
                            : this.alerts.map((alert) => html`
                                <div class="p-4 hover:bg-white/5 transition-colors group">
                                    <h4 class="text-sm font-medium text-white mb-1 group-hover:text-amber-400 transition-colors">
                                        ${alert.name}
                                    </h4>
                                    <div class="flex items-center justify-between text-xs">
                                        <span class="text-zinc-500">
                                            SKU: <span class="font-mono">${alert.sku}</span>
                                        </span>
                                        <div class="flex items-center gap-3">
                                            <span class="text-zinc-400">
                                                Current: <span class="text-white font-mono font-bold">${alert.current_qty}</span>
                                            </span>
                                            <span class="font-medium ${alert.alert_type === 'OUT_OF_STOCK' ? 'text-rose-500' : 'text-amber-500'}">
                                                ${alert.alert_type === 'OUT_OF_STOCK' ? 'Out of Stock' : 'Low Stock'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            `)
                        }
                    </div>
                </div>
            </div>
        `;
    }
}
