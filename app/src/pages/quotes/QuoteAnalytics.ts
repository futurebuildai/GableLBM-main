import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ArrowLeft, TrendingUp, Target, Clock, Sparkles, BarChart3, Percent } from 'lucide';
import { QuoteService } from '../../services/QuoteService.ts';
import type { QuoteAnalytics as QuoteAnalyticsType } from '../../types/quote.ts';

@customElement('gable-quote-analytics')
export class GableQuoteAnalytics extends LitElement {
    createRenderRoot() { return this; }

    @state() private analytics: QuoteAnalyticsType | null = null;
    @state() private loading = true;

    connectedCallback() {
        super.connectedCallback();
        this.loadAnalytics();
    }

    private async loadAnalytics() {
        try {
            const data = await QuoteService.getAnalytics();
            this.analytics = data;
        } catch (error) {
            console.error('Failed to load analytics:', error);
            ToastService.show('Failed to load quote analytics', 'error');
        } finally {
            this.loading = false;
        }
    }

    private renderKPICard(iconData: typeof Target, label: string, value: string, accent?: string) {
        return html`
            <div class="bg-slate-steel border border-white/10 rounded-lg p-5">
                <div class="flex items-center gap-2 mb-2">
                    ${icon(iconData, 16, 'w-4 h-4 text-zinc-500')}
                    <span class="text-xs text-zinc-500 uppercase tracking-wider">${label}</span>
                </div>
                <div class="text-2xl font-mono font-bold ${accent || 'text-white'}">${value}</div>
            </div>
        `;
    }

    private renderFunnelBar(label: string, count: number, total: number, color: string) {
        const pct = total > 0 ? (count / total) * 100 : 0;
        return html`
            <div class="flex items-center gap-3">
                <span class="text-zinc-400 text-sm w-20">${label}</span>
                <div class="flex-1 h-6 bg-white/5 rounded overflow-hidden">
                    <div class="h-full ${color} rounded transition-all duration-500" style="width: ${Math.max(pct, 1)}%"></div>
                </div>
                <span class="font-mono text-white text-sm w-10 text-right">${count}</span>
                <span class="text-zinc-600 text-xs w-12 text-right">${pct.toFixed(0)}%</span>
            </div>
        `;
    }

    render() {
        if (this.loading || !this.analytics) {
            return html`<div class="text-white p-8">Loading analytics...</div>`;
        }

        const analytics = this.analytics;
        const maxTrendCreated = Math.max(...(analytics.trend_data || []).map(t => t.created), 1);

        return html`
            <div class="space-y-6 max-w-6xl mx-auto">
                <!-- Header -->
                <div>
                    <button @click=${() => router.navigate('/quotes')} class="text-zinc-500 hover:text-white text-sm flex items-center gap-1 mb-3 transition-colors">
                        ${icon(ArrowLeft, 14)} Back to Quotes
                    </button>
                    <h1 class="text-3xl font-bold tracking-tight text-white font-mono flex items-center gap-3">
                        ${icon(BarChart3, 32, 'w-8 h-8 text-gable-green')}
                        Quote Analytics
                    </h1>
                    <p class="text-muted-foreground mt-1">Last 90 days performance \u2014 optimize the tradeoff between conversion and margins.</p>
                </div>

                <!-- KPI Cards -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    ${this.renderKPICard(Target, 'Total Quotes', String(analytics.total_quotes))}
                    ${this.renderKPICard(Percent, 'Conversion Rate', `${analytics.conversion_rate.toFixed(1)}%`, 'text-gable-green')}
                    ${this.renderKPICard(TrendingUp, 'Avg Margin (Won)', `$${analytics.avg_margin_accepted.toFixed(2)}`, 'text-emerald-400')}
                    ${this.renderKPICard(Clock, 'Avg Days to Close', analytics.avg_days_to_close.toFixed(1))}
                </div>

                <!-- Conversion Funnel + Value -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Funnel -->
                    <div class="bg-slate-steel border border-white/10 rounded-lg p-6">
                        <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-6">Conversion Funnel</h3>
                        <div class="space-y-4">
                            ${this.renderFunnelBar('Draft', analytics.draft_count, analytics.total_quotes, 'bg-zinc-500')}
                            ${this.renderFunnelBar('Sent', analytics.sent_count, analytics.total_quotes, 'bg-blue-500')}
                            ${this.renderFunnelBar('Accepted', analytics.accepted_count, analytics.total_quotes, 'bg-emerald-500')}
                            ${this.renderFunnelBar('Rejected', analytics.rejected_count, analytics.total_quotes, 'bg-red-500')}
                            ${this.renderFunnelBar('Expired', analytics.expired_count, analytics.total_quotes, 'bg-amber-500')}
                        </div>
                    </div>

                    <!-- Value Summary -->
                    <div class="bg-slate-steel border border-white/10 rounded-lg p-6">
                        <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-6">Quote Value</h3>
                        <div class="space-y-6">
                            <div>
                                <div class="text-xs text-zinc-500 mb-1">Total Quoted</div>
                                <div class="text-2xl font-mono font-bold text-white">$${analytics.total_quote_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div>
                                <div class="text-xs text-zinc-500 mb-1">Total Won</div>
                                <div class="text-2xl font-mono font-bold text-gable-green">$${analytics.total_accepted_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div class="pt-4 border-t border-white/5">
                                <div class="text-xs text-zinc-500 mb-1">Capture Rate (Value)</div>
                                <div class="text-lg font-mono font-bold text-emerald-400">
                                    ${analytics.total_quote_value > 0
                                        ? ((analytics.total_accepted_value / analytics.total_quote_value) * 100).toFixed(1)
                                        : '0.0'}%
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Margin vs Conversion - AI vs Manual -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Margin Analysis -->
                    <div class="bg-slate-steel border border-white/10 rounded-lg p-6">
                        <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-6">Margin: Won vs Lost</h3>
                        <p class="text-xs text-zinc-500 mb-4">Are you losing deals because margins are too high?</p>
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <span class="text-zinc-400 text-sm">Avg Margin (Accepted)</span>
                                <span class="font-mono text-emerald-400 font-bold">$${analytics.avg_margin_accepted.toFixed(2)}</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-zinc-400 text-sm">Avg Margin (Rejected)</span>
                                <span class="font-mono text-red-400 font-bold">$${analytics.avg_margin_rejected.toFixed(2)}</span>
                            </div>
                            ${analytics.avg_margin_rejected > analytics.avg_margin_accepted && analytics.avg_margin_rejected > 0 ? html`
                                <div class="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
                                    Rejected quotes have higher margins \u2014 consider adjusting pricing on competitive bids.
                                </div>
                            ` : nothing}
                        </div>
                    </div>

                    <!-- AI vs Manual -->
                    <div class="bg-slate-steel border border-white/10 rounded-lg p-6">
                        <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                            ${icon(Sparkles, 16, 'w-4 h-4 text-violet-400')}
                            AI vs Manual Performance
                        </h3>
                        <div class="space-y-5">
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-zinc-400 text-sm flex items-center gap-2">
                                        ${icon(Sparkles, 12, 'w-3 h-3 text-violet-400')} AI-Parsed Quotes
                                    </span>
                                    <span class="font-mono text-white text-sm">${analytics.ai_sourced_count}</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-zinc-500 text-xs ml-5">Conversion Rate</span>
                                    <span class="font-mono text-violet-400 font-bold">${analytics.ai_conversion_rate.toFixed(1)}%</span>
                                </div>
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-zinc-400 text-sm">Manual Quotes</span>
                                    <span class="font-mono text-white text-sm">${analytics.total_quotes - analytics.ai_sourced_count}</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-zinc-500 text-xs ml-5">Conversion Rate</span>
                                    <span class="font-mono text-zinc-300 font-bold">${analytics.manual_conversion_rate.toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 30-Day Trend -->
                ${analytics.trend_data && analytics.trend_data.length > 0 ? html`
                    <div class="bg-slate-steel border border-white/10 rounded-lg p-6">
                        <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-6">30-Day Quote Trend</h3>
                        <div class="flex items-end gap-1 h-32">
                            ${analytics.trend_data.map(day => html`
                                <div class="flex-1 flex flex-col items-center gap-0.5 group relative" title="${day.date}: ${day.created} created, ${day.accepted} accepted">
                                    <!-- Created bar -->
                                    <div
                                        class="w-full bg-zinc-600 rounded-t-sm transition-colors group-hover:bg-zinc-500"
                                        style="height: ${Math.max((day.created / maxTrendCreated) * 100, 2)}%"
                                    ></div>
                                    <!-- Accepted overlay -->
                                    ${day.accepted > 0 ? html`
                                        <div
                                            class="w-full bg-gable-green rounded-t-sm absolute bottom-0"
                                            style="height: ${Math.max((day.accepted / maxTrendCreated) * 100, 2)}%"
                                        ></div>
                                    ` : nothing}
                                </div>
                            `)}
                        </div>
                        <div class="flex justify-between mt-2 text-[10px] text-zinc-600">
                            <span>${analytics.trend_data[0]?.date}</span>
                            <div class="flex items-center gap-4">
                                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-zinc-600 inline-block"></span> Created</span>
                                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-gable-green inline-block"></span> Accepted</span>
                            </div>
                            <span>${analytics.trend_data[analytics.trend_data.length - 1]?.date}</span>
                        </div>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}
