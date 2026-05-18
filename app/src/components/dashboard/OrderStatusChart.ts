import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import Chart from 'chart.js/auto';

const COLORS = ['#00FFA3', '#38BDF8', '#818cf8', '#fbbf24', '#f43f5e', '#a1a1aa'];

/** Helper to map status to readable names */
function formatStatus(status: string): string {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

@customElement('gable-order-status-chart')
export class GableOrderStatusChart extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: false }) statusBreakdown: Record<string, number> = {};
    @property({ type: Boolean }) loading = false;

    @state() private _totalOrders = 0;

    private _chart: Chart<'doughnut'> | null = null;

    updated(changedProperties: Map<string, unknown>) {
        super.updated(changedProperties);
        if (changedProperties.has('statusBreakdown') || changedProperties.has('loading')) {
            if (!this.loading) {
                this._renderChart();
            }
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._destroyChart();
    }

    private _destroyChart() {
        if (this._chart) {
            this._chart.destroy();
            this._chart = null;
        }
    }

    private _renderChart() {
        // Defer to next frame to ensure DOM is ready
        requestAnimationFrame(() => {
            const canvas = this.querySelector<HTMLCanvasElement>('#orderStatusCanvas');
            if (!canvas) return;

            this._destroyChart();

            const data = Object.entries(this.statusBreakdown)
                .map(([status, count]) => ({
                    name: formatStatus(status),
                    value: count,
                }))
                .filter(item => item.value > 0);

            this._totalOrders = data.reduce((acc, curr) => acc + curr.value, 0);

            if (data.length === 0) return;

            this._chart = new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels: data.map(d => d.name),
                    datasets: [{
                        data: data.map(d => d.value),
                        backgroundColor: data.map((_, i) => COLORS[i % COLORS.length]),
                        borderWidth: 0,
                        spacing: 4,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#a1a1aa',
                                usePointStyle: true,
                                pointStyle: 'circle',
                                padding: 16,
                                font: { size: 11 },
                            },
                        },
                        tooltip: {
                            backgroundColor: 'rgba(22, 24, 33, 0.9)',
                            titleColor: '#a1a1aa',
                            bodyColor: '#ffffff',
                            bodyFont: { family: 'JetBrains Mono, monospace', weight: 'bold' },
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            cornerRadius: 8,
                            padding: 8,
                        },
                    },
                },
            });
        });
    }

    render() {
        if (this.loading) {
            return html`
                <div class="rounded-xl border border-white/10 bg-slate-steel/30 backdrop-blur-sm h-[400px]">
                    <div class="p-4 border-b border-white/5">
                        <div class="h-6 w-32 bg-white/10 rounded animate-pulse"></div>
                    </div>
                    <div class="p-4 flex items-center justify-center h-[320px]">
                        <div class="h-48 w-48 rounded-full border-4 border-white/10 border-t-gable-green/50 animate-spin"></div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="rounded-xl border border-white/10 bg-slate-steel/30 backdrop-blur-sm h-[400px] flex flex-col">
                <div class="p-4 border-b border-white/5">
                    <h3 class="text-base font-semibold text-white">Order Status</h3>
                </div>
                <div class="flex-1 min-h-0 relative p-4">
                    <div class="absolute inset-0 flex items-center justify-center flex-col pointer-events-none z-10">
                        <span class="text-4xl font-bold text-white font-mono">${this._totalOrders}</span>
                        <span class="text-xs text-zinc-500 uppercase tracking-widest">Active</span>
                    </div>
                    <canvas id="orderStatusCanvas" class="w-full h-full"></canvas>
                </div>
            </div>
        `;
    }
}
