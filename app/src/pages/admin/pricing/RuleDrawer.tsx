import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Trash2, AlertTriangle, Clock, User } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { categoryPricingService } from '../../../services/CategoryPricingService';
import { CustomerSelect } from '../../../components/customers/CustomerSelect';
import type { CategoryPricingRule, CategoryRuleType, CategoryPricingAudit } from '../../../types/category-pricing';
import type { Customer } from '../../../types/customer';
import { cn } from '../../../lib/utils';

interface RuleDrawerProps {
  rule: Partial<CategoryPricingRule> | null;
  categoryName: string;
  tierName: string;
  targetType?: 'TIER' | 'ACCOUNT';
  onSave: (rule: Partial<CategoryPricingRule>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const RULE_TYPES: { value: CategoryRuleType; label: string; unit: string; description: string }[] = [
  { value: 'MARKDOWN', label: 'Discount from List', unit: '%', description: 'Sell = List × (1 - X%)' },
  { value: 'MARKUP', label: 'Markup from Cost', unit: '%', description: 'Sell = Cost × (1 + X%)' },
  { value: 'MARGIN', label: 'Target Margin', unit: '%', description: 'Sell = Cost / (1 - X%)' },
  { value: 'FIXED', label: 'Fixed Price', unit: '$', description: 'Sell = $X.XX' },
];

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-gable-green/20 text-gable-green',
  UPDATE: 'bg-blueprint-blue/20 text-blueprint-blue',
  DELETE: 'bg-safety-red/20 text-safety-red',
};

export const RuleDrawer = ({ rule, categoryName, tierName, targetType, onSave, onDelete, onClose }: RuleDrawerProps) => {
  const [ruleType, setRuleType] = useState<CategoryRuleType>(rule?.rule_type || 'MARKDOWN');
  const [ruleValue, setRuleValue] = useState(rule?.rule_value?.toString() || '');
  const [marginFloor, setMarginFloor] = useState(rule?.margin_floor_pct?.toString() || '');
  const [showDelete, setShowDelete] = useState(false);
  const [auditEntries, setAuditEntries] = useState<CategoryPricingAudit[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(rule?.customer_id);

  const isEditing = !!rule?.id;
  const isAccountMode = targetType === 'ACCOUNT';

  useEffect(() => {
    setRuleType(rule?.rule_type || 'MARKDOWN');
    setRuleValue(rule?.rule_value?.toString() || '');
    setMarginFloor(rule?.margin_floor_pct?.toString() || '');
    setShowDelete(false);
    setSelectedCustomerId(rule?.customer_id);

    if (rule?.id) {
      categoryPricingService.getRuleAudit(rule.id).then(setAuditEntries).catch(() => {});
    } else {
      setAuditEntries([]);
    }
  }, [rule]);

  const handleSave = () => {
    const value = parseFloat(ruleValue);
    if (isNaN(value)) return;

    onSave({
      ...rule,
      rule_type: ruleType,
      rule_value: value,
      margin_floor_pct: marginFloor ? parseFloat(marginFloor) : undefined,
      ...(isAccountMode && selectedCustomerId ? { customer_id: selectedCustomerId, target_type: 'ACCOUNT' } : {}),
    });
  };

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
  };

  const selectedType = RULE_TYPES.find((t) => t.value === ruleType);

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed right-0 top-0 bottom-0 w-[400px] bg-slate-steel border-l border-white/10 shadow-2xl z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <h3 className="text-white font-semibold">{isEditing ? 'Edit Rule' : 'New Rule'}</h3>
          <p className="text-sm text-slate-400 mt-0.5">
            {isAccountMode ? (
              <span className="text-gable-green">Account Rule</span>
            ) : (
              <span className="text-gable-green">{tierName}</span>
            )}
            {' / '}
            <span className="text-blueprint-blue">{categoryName}</span>
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/5">
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Customer Select (Account mode only) */}
        {isAccountMode && (
          <div className="space-y-2">
            <CustomerSelect onSelect={handleCustomerSelect} selectedCustomerId={selectedCustomerId} />
          </div>
        )}

        {/* Rule Type */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-slate-300">Adjustment Method</label>
          <div className="space-y-2">
            {RULE_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setRuleType(type.value)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-lg border transition-colors',
                  ruleType === type.value
                    ? 'border-gable-green/50 bg-gable-green/5'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('text-sm font-medium', ruleType === type.value ? 'text-gable-green' : 'text-white')}>
                    {type.label}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">{type.unit}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-mono">{type.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Value */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">
            Value ({selectedType?.unit})
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
              {ruleType === 'FIXED' ? '$' : ''}
            </span>
            <input
              type="number"
              step="0.01"
              value={ruleValue}
              onChange={(e) => setRuleValue(e.target.value)}
              className={cn(
                'w-full bg-deep-space border border-white/10 rounded px-3 py-2.5 text-white font-mono text-lg',
                'placeholder-slate-500 focus:outline-none focus:border-gable-green transition-colors',
                ruleType === 'FIXED' ? 'pl-7' : ''
              )}
              placeholder={ruleType === 'FIXED' ? '0.00' : '0.00'}
              autoFocus
            />
            {ruleType !== 'FIXED' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
            )}
          </div>
        </div>

        {/* Margin Floor */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Margin Floor (optional)</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={marginFloor}
              onChange={(e) => setMarginFloor(e.target.value)}
              className="w-full bg-deep-space border border-white/10 rounded px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-gable-green transition-colors"
              placeholder="Min margin %"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
          </div>
          <p className="text-xs text-slate-500">Prevents price from dropping below this margin target.</p>
        </div>

        {/* Preview */}
        {ruleValue && (
          <div className="bg-deep-space border border-white/5 rounded-lg p-4 space-y-2">
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Preview</h4>
            <div className="text-sm text-slate-300">
              {ruleType === 'MARKDOWN' && (
                <p>
                  Base $100.00 <span className="text-slate-500">→</span>{' '}
                  <span className="text-gable-green font-mono font-semibold">
                    ${(100 * (1 - parseFloat(ruleValue || '0') / 100)).toFixed(2)}
                  </span>
                </p>
              )}
              {ruleType === 'MARKUP' && (
                <p>
                  Cost $50.00 <span className="text-slate-500">→</span>{' '}
                  <span className="text-gable-green font-mono font-semibold">
                    ${(50 * (1 + parseFloat(ruleValue || '0') / 100)).toFixed(2)}
                  </span>
                </p>
              )}
              {ruleType === 'MARGIN' && (
                <p>
                  Cost $50.00 <span className="text-slate-500">→</span>{' '}
                  <span className="text-gable-green font-mono font-semibold">
                    ${(50 / (1 - parseFloat(ruleValue || '0') / 100)).toFixed(2)}
                  </span>
                </p>
              )}
              {ruleType === 'FIXED' && (
                <p>
                  Fixed at{' '}
                  <span className="text-gable-green font-mono font-semibold">
                    ${parseFloat(ruleValue || '0').toFixed(2)}
                  </span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Delete */}
        {isEditing && (
          <div className="pt-4 border-t border-white/5">
            {!showDelete ? (
              <button
                onClick={() => setShowDelete(true)}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
                Delete this rule
              </button>
            ) : (
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertTriangle size={16} />
                  This will remove the rule. The inherited ancestor rule (if any) will apply instead.
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowDelete(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    onClick={() => rule?.id && onDelete(rule.id)}
                    className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                  >
                    Confirm Delete
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audit History */}
        {isEditing && auditEntries.length > 0 && (
          <div className="pt-4 border-t border-white/5 space-y-3">
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={12} />
              History
            </h4>
            <div className="space-y-2">
              {auditEntries.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 text-xs">
                  <span className={cn('px-1.5 py-0.5 rounded font-medium shrink-0', ACTION_COLORS[entry.action] || 'bg-white/10 text-slate-400')}>
                    {entry.action}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-slate-400">
                      <User size={10} />
                      <span className="truncate">{entry.performed_by}</span>
                    </div>
                    <div className="text-slate-500 mt-0.5">{formatTimestamp(entry.performed_at)}</div>
                    {entry.action === 'UPDATE' && entry.old_values && entry.new_values && (
                      <div className="mt-1 text-slate-500 font-mono">
                        {Object.keys(entry.new_values)
                          .filter((k) => entry.old_values && entry.old_values[k] !== entry.new_values![k])
                          .map((k) => (
                            <div key={k}>
                              {k}: {String(entry.old_values![k])} → {String(entry.new_values![k])}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/10 flex gap-3">
        <Button variant="outline" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!ruleValue || (isAccountMode && !selectedCustomerId)} className="flex-1">
          <Save size={16} className="mr-2" />
          {isEditing ? 'Update Rule' : 'Create Rule'}
        </Button>
      </div>
    </motion.div>
  );
};
