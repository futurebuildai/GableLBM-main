import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Target, Clock, Sparkles, BarChart3, Percent } from 'lucide-react';
import { QuoteService } from '../../services/QuoteService';
import type { QuoteAnalytics as QuoteAnalyticsType } from '../../types/quote';
import { useToast } from '../../components/ui/ToastContext';

export default function QuoteAnalytics() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [analytics, setAnalytics] = useState<QuoteAnalyticsType | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAnalytics();
    }, [showToast]);

    async function loadAnalytics() {
        try {
            const data = await QuoteService.getAnalytics();
            setAnalytics(data);
        } catch (error) {
            console.error('Failed to load analytics:', error);
            showToast('Failed to load quote analytics', 'error');
        } finally {
            setLoading(false);
        }
    }

    if (loading || !analytics) {
        return <div className="text-white p-8">Loading analytics...</div>;
    }

    const maxTrendCreated = Math.max(...(analytics.trend_data || []).map(t => t.created), 1);

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {/* Header */}
            <div>
                <button onClick={() => navigate('/quotes')} className="text-zinc-500 hover:text-white text-sm flex items-center gap-1 mb-3 transition-colors">
                    <ArrowLeft size={14} /> Back to Quotes
                </button>
                <h1 className="text-3xl font-bold tracking-tight text-white font-mono flex items-center gap-3">
                    <BarChart3 className="w-8 h-8 text-gable-green" />
                    Quote Analytics
                </h1>
                <p className="text-muted-foreground mt-1">Last 90 days performance — optimize the tradeoff between conversion and margins.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard icon={Target} label="Total Quotes" value={String(analytics.total_quotes)} />
                <KPICard icon={Percent} label="Conversion Rate" value={`${analytics.conversion_rate.toFixed(1)}%`} accent="text-gable-green" />
                <KPICard icon={TrendingUp} label="Avg Margin (Won)" value={`$${analytics.avg_margin_accepted.toFixed(2)}`} accent="text-emerald-400" />
                <KPICard icon={Clock} label="Avg Days to Close" value={analytics.avg_days_to_close.toFixed(1)} />
            </div>

            {/* Conversion Funnel + Value */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Funnel */}
                <div className="bg-slate-steel border border-white/10 rounded-lg p-6">
                    <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-6">Conversion Funnel</h3>
                    <div className="space-y-4">
                        <FunnelBar label="Draft" count={analytics.draft_count} total={analytics.total_quotes} color="bg-zinc-500" />
                        <FunnelBar label="Sent" count={analytics.sent_count} total={analytics.total_quotes} color="bg-blue-500" />
                        <FunnelBar label="Accepted" count={analytics.accepted_count} total={analytics.total_quotes} color="bg-emerald-500" />
                        <FunnelBar label="Rejected" count={analytics.rejected_count} total={analytics.total_quotes} color="bg-red-500" />
                        <FunnelBar label="Expired" count={analytics.expired_count} total={analytics.total_quotes} color="bg-amber-500" />
                    </div>
                </div>

                {/* Value Summary */}
                <div className="bg-slate-steel border border-white/10 rounded-lg p-6">
                    <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-6">Quote Value</h3>
                    <div className="space-y-6">
                        <div>
                            <div className="text-xs text-zinc-500 mb-1">Total Quoted</div>
                            <div className="text-2xl font-mono font-bold text-white">${analytics.total_quote_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div>
                            <div className="text-xs text-zinc-500 mb-1">Total Won</div>
                            <div className="text-2xl font-mono font-bold text-gable-green">${analytics.total_accepted_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div className="pt-4 border-t border-white/5">
                            <div className="text-xs text-zinc-500 mb-1">Capture Rate (Value)</div>
                            <div className="text-lg font-mono font-bold text-emerald-400">
                                {analytics.total_quote_value > 0
                                    ? ((analytics.total_accepted_value / analytics.total_quote_value) * 100).toFixed(1)
                                    : '0.0'}%
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Margin vs Conversion - AI vs Manual */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Margin Analysis */}
                <div className="bg-slate-steel border border-white/10 rounded-lg p-6">
                    <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-6">Margin: Won vs Lost</h3>
                    <p className="text-xs text-zinc-500 mb-4">Are you losing deals because margins are too high?</p>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-400 text-sm">Avg Margin (Accepted)</span>
                            <span className="font-mono text-emerald-400 font-bold">${analytics.avg_margin_accepted.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-400 text-sm">Avg Margin (Rejected)</span>
                            <span className="font-mono text-red-400 font-bold">${analytics.avg_margin_rejected.toFixed(2)}</span>
                        </div>
                        {analytics.avg_margin_rejected > analytics.avg_margin_accepted && analytics.avg_margin_rejected > 0 && (
                            <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
                                Rejected quotes have higher margins — consider adjusting pricing on competitive bids.
                            </div>
                        )}
                    </div>
                </div>

                {/* AI vs Manual */}
                <div className="bg-slate-steel border border-white/10 rounded-lg p-6">
                    <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-violet-400" />
                        AI vs Manual Performance
                    </h3>
                    <div className="space-y-5">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-zinc-400 text-sm flex items-center gap-2">
                                    <Sparkles className="w-3 h-3 text-violet-400" /> AI-Parsed Quotes
                                </span>
                                <span className="font-mono text-white text-sm">{analytics.ai_sourced_count}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-zinc-500 text-xs ml-5">Conversion Rate</span>
                                <span className="font-mono text-violet-400 font-bold">{analytics.ai_conversion_rate.toFixed(1)}%</span>
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-zinc-400 text-sm">Manual Quotes</span>
                                <span className="font-mono text-white text-sm">{analytics.total_quotes - analytics.ai_sourced_count}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-zinc-500 text-xs ml-5">Conversion Rate</span>
                                <span className="font-mono text-zinc-300 font-bold">{analytics.manual_conversion_rate.toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 30-Day Trend */}
            {analytics.trend_data && analytics.trend_data.length > 0 && (
                <div className="bg-slate-steel border border-white/10 rounded-lg p-6">
                    <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-6">30-Day Quote Trend</h3>
                    <div className="flex items-end gap-1 h-32">
                        {analytics.trend_data.map((day, idx) => (
                            <div key={idx} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${day.date}: ${day.created} created, ${day.accepted} accepted`}>
                                {/* Created bar */}
                                <div
                                    className="w-full bg-zinc-600 rounded-t-sm transition-colors group-hover:bg-zinc-500"
                                    style={{ height: `${Math.max((day.created / maxTrendCreated) * 100, 2)}%` }}
                                />
                                {/* Accepted overlay */}
                                {day.accepted > 0 && (
                                    <div
                                        className="w-full bg-gable-green rounded-t-sm absolute bottom-0"
                                        style={{ height: `${Math.max((day.accepted / maxTrendCreated) * 100, 2)}%` }}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] text-zinc-600">
                        <span>{analytics.trend_data[0]?.date}</span>
                        <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-zinc-600 inline-block" /> Created</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gable-green inline-block" /> Accepted</span>
                        </div>
                        <span>{analytics.trend_data[analytics.trend_data.length - 1]?.date}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Sub-components ---

function KPICard({ icon: Icon, label, value, accent }: { icon: typeof Target; label: string; value: string; accent?: string }) {
    return (
        <div className="bg-slate-steel border border-white/10 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-zinc-500" />
                <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
            </div>
            <div className={`text-2xl font-mono font-bold ${accent || 'text-white'}`}>{value}</div>
        </div>
    );
}

function FunnelBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
    const pct = total > 0 ? (count / total) * 100 : 0;
    return (
        <div className="flex items-center gap-3">
            <span className="text-zinc-400 text-sm w-20">{label}</span>
            <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden">
                <div className={`h-full ${color} rounded transition-all duration-500`} style={{ width: `${Math.max(pct, 1)}%` }} />
            </div>
            <span className="font-mono text-white text-sm w-10 text-right">{count}</span>
            <span className="text-zinc-600 text-xs w-12 text-right">{pct.toFixed(0)}%</span>
        </div>
    );
}
