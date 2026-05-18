import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import Chart from 'chart.js/auto';
import type { RevenueTrendPoint } from '../../types/dashboard.ts';

@customElement('gable-revenue-trend-chart')
export class GableRevenueTrendChart extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: false }) data: RevenueTrendPoint[] = [];
    @property({ type: Boolean }) loading = false;

    private _chart: Chart<'line'> | null = null;

    updated(changedProperties: Map<string, unknown>) {
        super.updated(changedProperties);
        if (changedProperties.has('data') || changedProperties.has('loading')) {
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
        requestAnimationFrame(() => {
            const canvas = this.querySelector<HTMLCanvasElement>('#revenueTrendCanvas');
            if (!canvas) return;

            this._destroyChart();

            const formattedData = this.data.map(point => ({
                ...point,
                revenue: point.revenue / 100, // Convert cents to dollars
            }));

            if (formattedData.length === 0) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Create gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 300);
            gradient.addColorStop(0, 'rgba(0, 255, 163, 0.3)');
            gradient.addColorStop(1, 'rgba(0, 255, 163, 0)');

            this._chart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: formattedData.map(d => d.date),
                    datasets: [{
                        data: formattedData.map(d => d.revenue),
                        borderColor: '#00FFA3',
                        borderWidth: 3,
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: '#ffffff',
                        pointHoverBorderWidth: 0,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 1500,
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index',
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(22, 24, 33, 0.9)',
                            titleColor: '#a1a1aa',
                            titleFont: { size: 11 },
                            bodyColor: '#00FFA3',
                            bodyFont: { family: 'JetBrains Mono, monospace', weight: 'bold', size: 16 },
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            cornerRadius: 8,
                            padding: 12,
                            callbacks: {
                                label: (context) => {
                                    const val = context.parsed.y;
                                    return val != null ? `$${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '$0.00';
                                },
                            },
                        },
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: {
                                color: '#52525b',
                                font: { size: 12 },
                                padding: 10,
                            },
                            border: { display: false },
                        },
                        y: {
                            grid: {
                                color: 'rgba(255,255,255,0.05)',
                            },
                            ticks: {
                                color: '#52525b',
                                font: { size: 12 },
                                padding: 10,
                                callback: (value) => `$${Number(value).toLocaleString()}`,
                            },
                            border: { display: false },
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
                        <div class="h-6 w-48 bg-white/10 rounded animate-pulse"></div>
                    </div>
                    <div class="h-[320px] flex items-end justify-between gap-2 px-6 pb-6">
                        ${[...Array(12)].map((_, i) => html`
                            <div class="w-full bg-white/5 rounded-t animate-pulse" style="height: ${(i * 13 + 20) % 60 + 20}%"></div>
                        `)}
                    </div>
                </div>
            `;
        }

        return html`
            <div class="rounded-xl border border-white/10 bg-slate-steel/30 backdrop-blur-sm h-[400px] flex flex-col">
                <div class="p-4 border-b border-white/5">
                    <h3 class="text-base font-semibold text-white">Revenue Trend</h3>
                </div>
                <div class="flex-1 min-h-0 p-4">
                    <canvas id="revenueTrendCanvas" class="w-full h-full"></canvas>
                </div>
            </div>
        `;
    }
}
