import type { MatrixCell, ProductCategory, CategoryPricingRule } from '../../../types/category-pricing';
import { cn } from '../../../lib/utils';

interface MatrixGridProps {
  categories: ProductCategory[];
  tiers: string[];
  cells: MatrixCell[];
  onCellClick: (cell: MatrixCell) => void;
  bulkMode?: boolean;
  selectedCells?: Set<string>;
  onCellToggle?: (key: string) => void;
}

const TIER_COLORS: Record<string, string> = {
  RETAIL: 'text-slate-400',
  SILVER: 'text-slate-300',
  GOLD: 'text-amber-400',
  PLATINUM: 'text-violet-400',
};

const formatRuleValue = (rule: CategoryPricingRule): string => {
  switch (rule.rule_type) {
    case 'MARKDOWN':
      return `-${rule.rule_value}%`;
    case 'MARKUP':
      return `+${rule.rule_value}%`;
    case 'MARGIN':
      return `M${rule.rule_value}%`;
    case 'FIXED':
      return `$${rule.rule_value.toFixed(2)}`;
    default:
      return `${rule.rule_value}`;
  }
};

const PrecedenceBadge = ({ type }: { type: string }) => {
  const label = type === 'ACCOUNT' ? 'A' : 'T';
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold',
        type === 'ACCOUNT'
          ? 'bg-gable-green/20 text-gable-green'
          : 'bg-blueprint-blue/20 text-blueprint-blue'
      )}
    >
      {label}
    </span>
  );
};

const flattenCategories = (categories: ProductCategory[], depth = 0): { category: ProductCategory; depth: number }[] => {
  const result: { category: ProductCategory; depth: number }[] = [];
  for (const cat of categories) {
    result.push({ category: cat, depth });
    if (cat.children && cat.children.length > 0) {
      result.push(...flattenCategories(cat.children, depth + 1));
    }
  }
  return result;
};

export const MatrixGrid = ({ categories, tiers, cells, onCellClick, bulkMode, selectedCells, onCellToggle }: MatrixGridProps) => {
  const flatCats = flattenCategories(categories);

  // Build a lookup: categoryID:tier → cell
  const cellMap = new Map<string, MatrixCell>();
  for (const cell of cells) {
    cellMap.set(`${cell.category_id}:${cell.tier}`, cell);
  }

  const handleCellAction = (cell: MatrixCell, key: string) => {
    if (bulkMode && onCellToggle) {
      onCellToggle(key);
    } else {
      onCellClick(cell);
    }
  };

  return (
    <div className="overflow-auto border border-white/5 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/[0.03]">
            <th className="sticky left-0 z-10 bg-slate-steel px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider border-r border-white/5 min-w-[220px]">
              Category
            </th>
            {tiers.map((tier) => (
              <th
                key={tier}
                className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider border-r border-white/5 last:border-r-0 min-w-[140px]"
              >
                <span className={TIER_COLORS[tier] || 'text-slate-400'}>{tier}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.03]">
          {flatCats.map(({ category, depth }) => (
            <tr key={category.id} className="group hover:bg-white/[0.02] transition-colors">
              <td
                className="sticky left-0 z-10 bg-slate-steel group-hover:bg-[#1a1c26] px-4 py-2.5 border-r border-white/5 transition-colors"
                style={{ paddingLeft: `${16 + depth * 20}px` }}
              >
                <span className={cn('text-sm', depth === 0 ? 'text-white font-medium' : 'text-slate-300')}>
                  {category.name}
                </span>
              </td>
              {tiers.map((tier) => {
                const key = `${category.id}:${tier}`;
                const cell = cellMap.get(key);
                const hasRule = cell?.rule != null;
                const isInherited = cell?.inherited ?? false;
                const isSelected = bulkMode && selectedCells?.has(key);

                return (
                  <td
                    key={tier}
                    onClick={() => cell && handleCellAction(cell, key)}
                    className={cn(
                      'px-4 py-2.5 text-center border-r border-white/[0.03] last:border-r-0 cursor-pointer transition-colors relative',
                      hasRule && !isInherited && 'bg-gable-green/[0.03]',
                      hasRule && isInherited && 'bg-blueprint-blue/[0.03]',
                      isSelected && 'ring-2 ring-inset ring-gable-green/50 bg-gable-green/10',
                      'hover:bg-white/5'
                    )}
                  >
                    {bulkMode && (
                      <div className="absolute top-1 right-1">
                        <div className={cn(
                          'w-3.5 h-3.5 rounded border transition-colors',
                          isSelected ? 'bg-gable-green border-gable-green' : 'border-white/20'
                        )} />
                      </div>
                    )}
                    {hasRule && cell?.rule ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          className={cn(
                            'font-mono text-sm font-medium',
                            isInherited ? 'text-blueprint-blue/70' : 'text-gable-green'
                          )}
                        >
                          {formatRuleValue(cell.rule)}
                        </span>
                        {!isInherited && <PrecedenceBadge type={cell.rule.target_type} />}
                        {isInherited && (
                          <span className="text-[9px] text-blueprint-blue/50 font-mono" title={`Inherited from ${cell.source_path}`}>
                            inh
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-600 text-xs">--</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
