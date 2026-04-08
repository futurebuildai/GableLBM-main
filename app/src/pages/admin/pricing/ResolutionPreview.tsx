import { useState } from 'react';
import { Search, ArrowRight, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { ProductSelect } from '../../../components/products/ProductSelect';
import { CustomerSelect } from '../../../components/customers/CustomerSelect';
import { categoryPricingService } from '../../../services/CategoryPricingService';
import type { ResolvedCategoryPrice } from '../../../types/category-pricing';
import type { Product } from '../../../types/product';
import type { Customer } from '../../../types/customer';
import { cn } from '../../../lib/utils';

const MATCH_LABELS: Record<string, { label: string; color: string }> = {
  account_exact: { label: 'Account + Exact Category', color: 'text-gable-green' },
  account_ancestor: { label: 'Account + Ancestor Category', color: 'text-gable-green' },
  tier_exact: { label: 'Tier + Exact Category', color: 'text-blueprint-blue' },
  tier_ancestor: { label: 'Tier + Ancestor Category', color: 'text-blueprint-blue' },
  none: { label: 'No Match (Base Price)', color: 'text-slate-400' },
};

export const ResolutionPreview = () => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [result, setResult] = useState<ResolvedCategoryPrice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async () => {
    if (!selectedProduct) return;
    setLoading(true);
    setError(null);
    try {
      // Auto-detect tier from selected customer's price level
      const tier = selectedCustomer?.price_level?.name;
      const res = await categoryPricingService.resolvePreview(
        selectedProduct.id,
        selectedCustomer?.id,
        tier || undefined
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolution failed');
    } finally {
      setLoading(false);
    }
  };

  const matchInfo = result ? MATCH_LABELS[result.match_type] || MATCH_LABELS.none : null;

  return (
    <div className="bg-slate-steel border border-white/5 rounded-lg p-6 space-y-4">
      <h3 className="text-white font-semibold flex items-center gap-2">
        <Search size={18} className="text-blueprint-blue" />
        Resolution Preview
      </h3>
      <p className="text-xs text-slate-500">Test which pricing rule resolves for a given product and customer/tier.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProductSelect
          onSelect={(p) => setSelectedProduct(p)}
          selectedProductId={selectedProduct?.id}
        />
        <CustomerSelect
          onSelect={(c) => setSelectedCustomer(c)}
          selectedCustomerId={selectedCustomer?.id}
        />
      </div>

      {selectedCustomer && (
        <div className="text-xs text-slate-500">
          Auto-detected tier:{' '}
          <span className="text-gable-green font-mono font-medium">
            {selectedCustomer.price_level?.name || 'RETAIL'}
          </span>
        </div>
      )}

      <Button onClick={handleResolve} disabled={!selectedProduct || loading} isLoading={loading}>
        <Search size={14} className="mr-2" />
        Resolve
      </Button>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">{error}</div>
      )}

      {result && (
        <div className="bg-deep-space border border-white/5 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            {result.rule ? (
              <CheckCircle size={20} className="text-gable-green" />
            ) : (
              <XCircle size={20} className="text-slate-500" />
            )}
            <span className={cn('text-sm font-medium', matchInfo?.color)}>
              {matchInfo?.label}
            </span>
          </div>

          {result.category_path && (
            <div className="text-xs text-slate-500">
              Category path: <span className="text-slate-300 font-mono">{result.category_path}</span>
            </div>
          )}

          {result.rule && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">Rule:</span>
              <span className="text-white font-mono font-medium">
                {result.rule.rule_type} {result.rule.rule_value}
                {result.rule.rule_type !== 'FIXED' ? '%' : ''}
              </span>
              <ArrowRight size={14} className="text-slate-500" />
              <span className="text-slate-400">on</span>
              <span className="text-blueprint-blue font-mono">{result.rule.category_name}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
