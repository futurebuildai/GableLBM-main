import { User, Pencil, Trash2 } from 'lucide-react';
import type { CategoryPricingRule } from '../../../types/category-pricing';

interface AccountRulesTableProps {
  rules: CategoryPricingRule[];
  onEdit: (rule: CategoryPricingRule) => void;
  onDelete: (id: string) => void;
}

const formatRuleValue = (rule: CategoryPricingRule): string => {
  switch (rule.rule_type) {
    case 'MARKDOWN': return `-${rule.rule_value}%`;
    case 'MARKUP': return `+${rule.rule_value}%`;
    case 'MARGIN': return `M${rule.rule_value}%`;
    case 'FIXED': return `$${rule.rule_value.toFixed(2)}`;
    default: return `${rule.rule_value}`;
  }
};

const RULE_TYPE_COLORS: Record<string, string> = {
  MARKDOWN: 'bg-gable-green/10 text-gable-green border-gable-green/20',
  MARKUP: 'bg-blueprint-blue/10 text-blueprint-blue border-blueprint-blue/20',
  MARGIN: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  FIXED: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

export const AccountRulesTable = ({ rules, onEdit, onDelete }: AccountRulesTableProps) => {
  if (rules.length === 0) {
    return (
      <div className="bg-slate-steel border border-white/5 rounded-lg p-12 text-center">
        <User className="w-8 h-8 text-slate-500 mx-auto mb-4" />
        <p className="text-slate-400">No account-specific rules</p>
        <p className="text-slate-500 text-sm mt-1">
          Create a rule to give a specific customer a custom price on a category.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-auto border border-white/5 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/[0.03]">
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Customer</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Category</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Rule</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.03]">
          {rules.map((rule) => (
            <tr key={rule.id} className="group hover:bg-white/[0.02] transition-colors">
              <td className="px-4 py-3">
                <div className="text-white font-medium">{rule.customer_name || 'Unknown'}</div>
                <div className="text-xs text-slate-500 font-mono">{rule.customer_id}</div>
              </td>
              <td className="px-4 py-3">
                <div className="text-slate-300">{rule.category_name}</div>
                <div className="text-xs text-slate-500 font-mono">{rule.category_path}</div>
              </td>
              <td className="px-4 py-3 text-center">
                <span className={`inline-flex items-center px-2 py-1 rounded border text-xs font-mono font-medium ${RULE_TYPE_COLORS[rule.rule_type] || ''}`}>
                  {rule.rule_type} {formatRuleValue(rule)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(rule)}
                    className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(rule.id)}
                    className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
