import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { TemplateResult } from 'lit';

@customElement('gable-kpi-card')
export class GableKPICard extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: String, attribute: 'card-title' }) cardTitle = '';
    @property() value: string | number = '';
    @property({ type: String }) subValue?: string;
    @property({ type: Number }) trend?: number;
    @property({ attribute: false }) iconHtml?: TemplateResult;
    @property({ type: Boolean }) loading = false;
    @property({ type: String }) valueColor = 'text-white';

    private getTrendColor(): string {
        if (this.trend === undefined || this.trend === null) return 'text-zinc-500';
        if (this.trend > 0) return 'text-emerald-400';
        if (this.trend < 0) return 'text-rose-400';
        return 'text-zinc-500';
    }

    private getTrendArrow(): string {
        if (this.trend === undefined || this.trend === null) return '';
        if (this.trend > 0) return '\u25B2'; // up triangle
        if (this.trend < 0) return '\u25BC'; // down triangle
        return '\u2014'; // em dash
    }

    render() {
        if (this.loading) {
            return html`
                <div class="rounded-xl border border-white/5 bg-slate-steel/50">
                    <div class="p-6 relative overflow-hidden">
                        <div class="flex justify-between items-start mb-4">
                            <div class="h-4 w-24 bg-white/10 rounded animate-pulse"></div>
                            <div class="h-8 w-8 bg-white/10 rounded-full animate-pulse"></div>
                        </div>
                        <div class="h-8 w-32 bg-white/10 rounded mb-2 animate-pulse"></div>
                        <div class="h-4 w-16 bg-white/10 rounded animate-pulse"></div>
                        <div class="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent z-10"></div>
                    </div>
                </div>
            `;
        }

        // Parse numeric value if string starts with $
        const numericValue = typeof this.value === 'string' && this.value.startsWith('$')
            ? parseFloat(this.value.replace(/[^0-9.-]+/g, ''))
            : typeof this.value === 'number' ? this.value : 0;

        const isCurrency = typeof this.value === 'string' && this.value.startsWith('$');

        const displayValue = typeof this.value === 'number'
            ? this.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
            : isCurrency
                ? numericValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : this.value;

        return html`
            <div class="rounded-xl border border-white/10 bg-slate-steel/50 hover:bg-slate-steel/70 hover:border-white/20 transition-all duration-300 cursor-pointer group relative overflow-hidden">
                <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity duration-300 transform group-hover:scale-110">
                    ${this.iconHtml ? html`<div class="text-current scale-150">${this.iconHtml}</div>` : nothing}
                </div>

                <div class="p-6 relative z-10">
                    <div class="flex items-center justify-between mb-2">
                        <h3 class="text-sm font-medium text-zinc-400 font-sans tracking-wide">${this.cardTitle}</h3>
                        ${this.iconHtml ? html`
                            <div class="p-2 rounded-lg bg-white/5 text-zinc-300 group-hover:text-gable-green group-hover:bg-gable-green/10 transition-colors duration-300">
                                ${this.iconHtml}
                            </div>
                        ` : nothing}
                    </div>

                    <div class="text-3xl font-mono font-bold tracking-tight ${this.valueColor} flex items-baseline gap-1">
                        ${isCurrency ? html`<span>$</span>` : nothing}
                        <span>${displayValue}</span>
                    </div>

                    <div class="flex items-center gap-2 mt-2 h-6">
                        ${this.trend !== undefined ? html`
                            <div class="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 ${this.getTrendColor()}">
                                <span>${this.getTrendArrow()}</span>
                                <span>${Math.abs(this.trend).toFixed(1)}%</span>
                            </div>
                        ` : nothing}
                        ${this.subValue ? html`<span class="text-xs text-zinc-500 font-mono">${this.subValue}</span>` : nothing}
                    </div>
                </div>

                <!-- Hover Glow Effect -->
                <div class="absolute -bottom-4 -right-4 w-24 h-24 bg-gable-green/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            </div>
        `;
    }
}
