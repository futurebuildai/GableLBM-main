import { useState, useEffect, useCallback } from 'react';
import { PricingService } from '../../services/pricing.service';
import type { EscalationType, MarketIndex, EscalationResult, QuoteLineEscalator } from '../../types/pricing';
import { TrendingUp, AlertTriangle, Link2, Calendar, Percent, BarChart3 } from 'lucide-react';
import { useToast } from '../ui/ToastContext';

interface EscalatorToggleProps {
    basePrice: number;
    escalator: QuoteLineEscalator;
    onChange: (escalator: QuoteLineEscalator) => void;
}

export const EscalatorToggle = ({ basePrice, escalator, onChange }: EscalatorToggleProps) => {
    const { showToast } = useToast();
    const [indices, setIndices] = useState<MarketIndex[]>([]);
    const [loading, setLoading] = useState(false);

    const loadIndices = useCallback(async () => {
        try {
            const data = await PricingService.getMarketIndices();
            setIndices(data);
        } catch (err) {
            console.error('Failed to load market indices', err);
            showToast('Failed to load market indices', 'error');
        }
    }, [showToast]);

    useEffect(() => {
        if (escalator.enabled) {
            loadIndices();
        }
    }, [escalator.enabled, loadIndices]);

    const handleToggle = () => {
        const today = new Date().toISOString().split('T')[0];
        const threeMonthsOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        onChange({
            ...escalator,
            enabled: !escalator.enabled,
            escalation_type: escalator.escalation_type || 'PERCENTAGE',
            escalation_rate: escalator.escalation_rate || 5,
            effective_date: escalator.effective_date || today,
            target_date: escalator.target_date || threeMonthsOut,
            result: undefined,
        });
    };

    const handleTypeChange = (type: EscalationType) => {
        onChange({ ...escalator, escalation_type: type, result: undefined });
    };

    const handleRateChange = (rate: number) => {
        onChange({ ...escalator, escalation_rate: rate, result: undefined });
    };

    const handleDateChange = (field: 'effective_date' | 'target_date', value: string) => {
        onChange({ ...escalator, [field]: value, result: undefined });
    };

    const handleIndexChange = (indexId: string) => {
        onChange({ ...escalator, market_index_id: indexId, result: undefined });
    };

    const handleCalculate = async () => {
        if (!escalator.enabled) return;
        setLoading(true);
        try {
            const result: EscalationResult = await PricingService.calculateEscalation({
                base_price: basePrice,
                escalation_type: escalator.escalation_type,
                escalation_rate: escalator.escalation_rate,
                effective_date: escalator.effective_date,
                target_date: escalator.target_date,
                market_index_id: escalator.market_index_id,
            });
            onChange({ ...escalator, result });
        } catch (err) {
            console.error('Failed to calculate escalation', err);
            showToast('Failed to calculate escalation', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mt-3">
            {/* Toggle Button */}
            <button
                type="button"
                onClick={handleToggle}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-all duration-200 ${escalator.enabled
                        ? 'bg-gable-green/15 border-gable-green/40 text-gable-green hover:bg-gable-green/25'
                        : 'bg-white/5 border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300'
                    }`}
            >
                <TrendingUp className="w-3.5 h-3.5" />
                {escalator.enabled ? 'Escalator Active' : 'Enable Escalator'}
            </button>

            {/* Escalator Configuration Panel */}
            {escalator.enabled && (
                <div className="mt-3 p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Type Selector */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => handleTypeChange('PERCENTAGE')}
                            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all ${escalator.escalation_type === 'PERCENTAGE'
                                    ? 'bg-gable-green/10 border-gable-green/30 text-gable-green'
                                    : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                                }`}
                        >
                            <Percent className="w-3.5 h-3.5" />
                            % Escalator
                        </button>
                        <button
                            type="button"
                            onClick={() => handleTypeChange('INDEX_DELTA')}
                            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all ${escalator.escalation_type === 'INDEX_DELTA'
                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                    : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                                }`}
                        >
                            <BarChart3 className="w-3.5 h-3.5" />
                            Index-Linked
                        </button>
                    </div>

                    {/* Configuration Inputs */}
                    <div className="grid grid-cols-2 gap-3">
                        {escalator.escalation_type === 'PERCENTAGE' ? (
                            <div>
                                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                                    Monthly Rate (%)
                                </label>
                                <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="50"
                                    value={escalator.escalation_rate}
                                    onChange={e => handleRateChange(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-gable-green/50 focus:outline-none focus:ring-1 focus:ring-gable-green/20 transition-colors"
                                />
                            </div>
                        ) : (
                            <div>
                                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                                    Market Index
                                </label>
                                <select
                                    value={escalator.market_index_id || ''}
                                    onChange={e => handleIndexChange(e.target.value)}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-colors"
                                >
                                    <option value="">Select Index...</option>
                                    {indices.map(idx => (
                                        <option key={idx.id} value={idx.id}>
                                            {idx.name} ({idx.current_value.toFixed(2)} {idx.unit})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {escalator.escalation_type === 'INDEX_DELTA' && (
                            <div>
                                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                                    Base Index Value
                                </label>
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={escalator.escalation_rate}
                                    onChange={e => handleRateChange(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-colors"
                                />
                            </div>
                        )}
                    </div>

                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Effective Date
                            </label>
                            <input
                                type="date"
                                value={escalator.effective_date}
                                onChange={e => handleDateChange('effective_date', e.target.value)}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-gable-green/50 focus:outline-none focus:ring-1 focus:ring-gable-green/20 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Target Date
                            </label>
                            <input
                                type="date"
                                value={escalator.target_date}
                                onChange={e => handleDateChange('target_date', e.target.value)}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-gable-green/50 focus:outline-none focus:ring-1 focus:ring-gable-green/20 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Calculate Button */}
                    <button
                        type="button"
                        onClick={handleCalculate}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 text-xs font-medium px-4 py-2.5 rounded-lg bg-gable-green/10 border border-gable-green/20 text-gable-green hover:bg-gable-green/20 transition-all disabled:opacity-50"
                    >
                        <TrendingUp className="w-3.5 h-3.5" />
                        {loading ? 'Calculating...' : 'Calculate Future Price'}
                    </button>

                    {/* Results Display */}
                    {escalator.result && (
                        <div className="space-y-3 pt-2 border-t border-white/5">
                            {/* Future Price */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-400">Future Realized Price</span>
                                <span className="text-lg font-mono font-bold text-emerald-400">
                                    ${escalator.result.future_price.toFixed(2)}
                                </span>
                            </div>

                            {/* Delta Info */}
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-zinc-500">
                                    {escalator.result.months_out} month{escalator.result.months_out !== 1 ? 's' : ''} out
                                </span>
                                <span className={`font-mono ${escalator.result.price_delta > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    {escalator.result.price_delta > 0 ? '+' : ''}${escalator.result.price_delta.toFixed(2)}
                                    {' '}({escalator.result.delta_percent > 0 ? '+' : ''}{escalator.result.delta_percent.toFixed(1)}%)
                                </span>
                            </div>

                            {/* Index-Linked Badge */}
                            {escalator.escalation_type === 'INDEX_DELTA' && (
                                <div className="flex items-center gap-1.5 text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-1 w-fit">
                                    <Link2 className="w-3 h-3" />
                                    Index-Linked Pricing
                                </div>
                            )}

                            {/* Stale Price Warning */}
                            {escalator.result.is_stale && (
                                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="font-semibold">Stale Price Warning</span>
                                        <p className="text-amber-400/70 mt-0.5">
                                            Market index has moved {escalator.result.stale_delta_pct.toFixed(1)}% since this price was set. Consider recalculating.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
