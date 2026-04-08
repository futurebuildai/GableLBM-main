import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { LayoutGrid, RefreshCw, ChevronDown, ChevronRight, AlertTriangle, Plus, User, Grid3X3, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { categoryPricingService } from '../../../services/CategoryPricingService';
import { CategoryTree } from './CategoryTree';
import { MatrixGrid } from './MatrixGrid';
import { RuleDrawer } from './RuleDrawer';
import { ResolutionPreview } from './ResolutionPreview';
import { AccountRulesTable } from './AccountRulesTable';
import type { ProductCategory, MatrixCell, MatrixResponse, CategoryPricingRule, CategoryRuleType } from '../../../types/category-pricing';
import { cn } from '../../../lib/utils';
import { useToast } from '../../../components/ui/ToastContext';

type Tab = 'matrix' | 'accounts';

export const PricingMatrix = () => {
  const { showToast } = useToast();
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [drawerState, setDrawerState] = useState<{
    open: boolean;
    cell: MatrixCell | null;
    targetType?: 'TIER' | 'ACCOUNT';
  }>({ open: false, cell: null });
  const [showPreview, setShowPreview] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('matrix');
  const [accountRules, setAccountRules] = useState<CategoryPricingRule[]>([]);
  const [accountRulesLoading, setAccountRulesLoading] = useState(false);

  // Bulk mode state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [bulkRuleType, setBulkRuleType] = useState<CategoryRuleType>('MARKDOWN');
  const [bulkRuleValue, setBulkRuleValue] = useState('');

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await categoryPricingService.getMatrix();
      setMatrix(data);
    } catch (err) {
      console.error('Failed to load pricing matrix:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pricing matrix');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAccountRules = useCallback(async () => {
    setAccountRulesLoading(true);
    try {
      const rules = await categoryPricingService.listRules({ target_type: 'ACCOUNT' });
      setAccountRules(rules);
    } catch (err) {
      console.error('Failed to load account rules:', err);
    } finally {
      setAccountRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  useEffect(() => {
    if (activeTab === 'accounts') {
      loadAccountRules();
    }
  }, [activeTab, loadAccountRules]);

  const handleCellClick = (cell: MatrixCell) => {
    if (bulkMode) return; // handled by onCellToggle
    // If the cell is inherited, strip the parent's rule ID so the drawer
    // opens in "New Rule" mode to create a child-specific override
    if (cell.inherited && cell.rule) {
      const { id: _parentId, ...ruleWithoutId } = cell.rule;
      const overrideCell: MatrixCell = {
        ...cell,
        rule: ruleWithoutId as MatrixCell['rule'],
        inherited: false,
      };
      setDrawerState({ open: true, cell: overrideCell });
    } else {
      setDrawerState({ open: true, cell });
    }
  };

  const handleDrawerClose = () => {
    setDrawerState({ open: false, cell: null });
  };

  const handleSaveRule = async (rule: Partial<CategoryPricingRule>) => {
    const cell = drawerState.cell;
    if (!cell) return;

    try {
      if (rule.id) {
        await categoryPricingService.updateRule(rule.id, rule);
        showToast('Rule updated successfully', 'success');
      } else {
        await categoryPricingService.createRule({
          ...rule,
          target_type: rule.target_type || 'TIER',
          tier: rule.target_type === 'ACCOUNT' ? undefined : cell.tier,
          category_id: cell.category_id,
          is_active: true,
        });
        showToast('Rule created successfully', 'success');
      }
      handleDrawerClose();
      await loadMatrix();
      if (activeTab === 'accounts') await loadAccountRules();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save rule';
      showToast(message, 'error');
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await categoryPricingService.deleteRule(id);
      showToast('Rule deleted', 'success');
      handleDrawerClose();
      await loadMatrix();
      if (activeTab === 'accounts') await loadAccountRules();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete rule';
      showToast(message, 'error');
    }
  };

  const handleCategorySelect = (category: ProductCategory) => {
    setSelectedCategory(category.id === selectedCategory ? null : category.id);
  };

  // --- Bulk mode handlers ---
  const handleCellToggle = (key: string) => {
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleBulkApply = async () => {
    const value = parseFloat(bulkRuleValue);
    if (isNaN(value) || selectedCells.size === 0 || !matrix) return;

    // Build rules from selected cells
    const rules: Partial<CategoryPricingRule>[] = [];
    for (const key of selectedCells) {
      const [catId, tier] = key.split(':');
      rules.push({
        target_type: 'TIER',
        tier,
        category_id: catId,
        rule_type: bulkRuleType,
        rule_value: value,
        is_active: true,
      });
    }

    try {
      const result = await categoryPricingService.bulkUpsertRules(rules);
      showToast(`${result.count} rules applied`, 'success');
      setBulkMode(false);
      setSelectedCells(new Set());
      setBulkRuleValue('');
      await loadMatrix();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bulk operation failed';
      showToast(message, 'error');
    }
  };

  const handleExitBulkMode = () => {
    setBulkMode(false);
    setSelectedCells(new Set());
    setBulkRuleValue('');
  };

  // --- Account rule edit from table ---
  const handleEditAccountRule = (rule: CategoryPricingRule) => {
    const cell: MatrixCell = {
      category_id: rule.category_id,
      category_name: rule.category_name || '',
      category_path: rule.category_path || '',
      tier: '',
      rule,
      inherited: false,
    };
    setDrawerState({ open: true, cell, targetType: 'ACCOUNT' });
  };

  const handleNewAccountRule = () => {
    // Open drawer in account mode with no pre-selected cell
    const cell: MatrixCell = {
      category_id: matrix?.categories?.[0]?.id || '',
      category_name: matrix?.categories?.[0]?.name || '',
      category_path: matrix?.categories?.[0]?.path || '',
      tier: '',
      rule: undefined,
      inherited: false,
    };
    setDrawerState({ open: true, cell, targetType: 'ACCOUNT' });
  };

  return (
    <div className="min-h-screen bg-deep-space p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <LayoutGrid className="w-8 h-8 text-gable-green" />
            Pricing Matrix
          </h1>
          <p className="text-slate-400 mt-1">
            Configure tier and account-level pricing rules by product category.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'matrix' && !bulkMode && (
            <Button variant="outline" onClick={() => setBulkMode(true)}>
              <Grid3X3 size={14} className="mr-2" />
              Bulk Edit
            </Button>
          )}
          <Button variant="outline" onClick={loadMatrix} disabled={loading}>
            <RefreshCw size={14} className={cn('mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('matrix')}
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'matrix'
              ? 'bg-gable-green/10 text-gable-green'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <Grid3X3 size={14} className="inline mr-1.5" />
          Tier Matrix
        </button>
        <button
          onClick={() => setActiveTab('accounts')}
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'accounts'
              ? 'bg-gable-green/10 text-gable-green'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <User size={14} className="inline mr-1.5" />
          Account Rules
          {accountRules.length > 0 && (
            <span className="ml-1.5 text-xs bg-white/10 px-1.5 py-0.5 rounded">
              {accountRules.length}
            </span>
          )}
        </button>
      </div>

      {/* Bulk Mode Toolbar */}
      {bulkMode && (
        <div className="bg-gable-green/5 border border-gable-green/20 rounded-lg px-4 py-3 flex items-center gap-4">
          <span className="text-sm text-gable-green font-medium">
            {selectedCells.size} cell{selectedCells.size !== 1 ? 's' : ''} selected
          </span>
          <select
            value={bulkRuleType}
            onChange={(e) => setBulkRuleType(e.target.value as CategoryRuleType)}
            className="bg-deep-space border border-white/10 rounded px-2 py-1.5 text-white text-sm"
          >
            <option value="MARKDOWN">MARKDOWN</option>
            <option value="MARKUP">MARKUP</option>
            <option value="MARGIN">MARGIN</option>
            <option value="FIXED">FIXED</option>
          </select>
          <input
            type="number"
            step="0.01"
            value={bulkRuleValue}
            onChange={(e) => setBulkRuleValue(e.target.value)}
            placeholder="Value"
            className="w-24 bg-deep-space border border-white/10 rounded px-2 py-1.5 text-white font-mono text-sm"
          />
          <Button
            onClick={handleBulkApply}
            disabled={selectedCells.size === 0 || !bulkRuleValue}
            className="text-sm"
          >
            Apply to Selected
          </Button>
          <button onClick={handleExitBulkMode} className="text-slate-400 hover:text-white p-1 ml-auto">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Legend */}
      {activeTab === 'matrix' && (
        <div className="flex items-center gap-6 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-gable-green/20 border border-gable-green/30" />
            Direct rule
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blueprint-blue/20 border border-blueprint-blue/30" />
            Inherited from ancestor
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-gable-green/20 text-gable-green">
              A
            </span>
            Account-specific
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-blueprint-blue/20 text-blueprint-blue">
              T
            </span>
            Tier-wide
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-safety-red/5 border border-safety-red/20 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={18} className="text-safety-red shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-safety-red font-medium">Failed to load pricing matrix</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Make sure the backend is running with <code className="font-mono text-blueprint-blue">CATEGORY_PRICING_ENABLED=true</code> and migrations 049-052 have been applied.
            </p>
          </div>
          <Button variant="outline" onClick={loadMatrix} disabled={loading} className="shrink-0">
            <RefreshCw size={14} className={cn('mr-2', loading && 'animate-spin')} />
            Retry
          </Button>
        </div>
      )}

      {/* Main Content */}
      {activeTab === 'matrix' ? (
        <div className="flex gap-6">
          {/* Category Tree (Left Sidebar) */}
          <div className="w-[260px] shrink-0 bg-slate-steel border border-white/5 rounded-lg p-4 max-h-[calc(100vh-280px)] overflow-y-auto">
            {loading && !matrix ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm p-4">
                <RefreshCw size={14} className="animate-spin" />
                Loading categories...
              </div>
            ) : matrix ? (
              <CategoryTree
                categories={matrix.categories}
                selectedId={selectedCategory}
                onSelect={handleCategorySelect}
              />
            ) : (
              <div className="text-slate-500 text-sm p-4">No categories loaded.</div>
            )}
          </div>

          {/* Matrix Grid (Center) */}
          <div className="flex-1 min-w-0">
            {loading && !matrix ? (
              <div className="bg-slate-steel border border-white/5 rounded-lg p-12 text-center">
                <RefreshCw className="w-8 h-8 text-slate-500 mx-auto mb-4 animate-spin" />
                <p className="text-slate-400">Loading pricing matrix...</p>
              </div>
            ) : matrix ? (
              <MatrixGrid
                categories={matrix.categories}
                tiers={matrix.tiers}
                cells={matrix.cells}
                onCellClick={handleCellClick}
                bulkMode={bulkMode}
                selectedCells={selectedCells}
                onCellToggle={handleCellToggle}
              />
            ) : (
              <div className="bg-slate-steel border border-white/5 rounded-lg p-12 text-center">
                <LayoutGrid className="w-8 h-8 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-400">No pricing data available.</p>
                <p className="text-slate-500 text-sm mt-1">
                  Enable the category pricing engine with <code className="font-mono text-blueprint-blue">CATEGORY_PRICING_ENABLED=true</code>
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Account Rules Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Account-Specific Pricing Rules</h2>
            <Button onClick={handleNewAccountRule}>
              <Plus size={14} className="mr-2" />
              New Account Rule
            </Button>
          </div>
          {accountRulesLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm p-8 justify-center">
              <RefreshCw size={14} className="animate-spin" />
              Loading account rules...
            </div>
          ) : (
            <AccountRulesTable
              rules={accountRules}
              onEdit={handleEditAccountRule}
              onDelete={handleDeleteRule}
            />
          )}
        </div>
      )}

      {/* Resolution Preview (Collapsible) */}
      <div>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          {showPreview ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          Resolution Preview
        </button>
        {showPreview && (
          <div className="mt-3">
            <ResolutionPreview />
          </div>
        )}
      </div>

      {/* Rule Drawer */}
      <AnimatePresence>
        {drawerState.open && drawerState.cell && (
          <RuleDrawer
            rule={drawerState.cell.rule || {
              target_type: drawerState.targetType || 'TIER',
              tier: drawerState.cell.tier,
              category_id: drawerState.cell.category_id,
            }}
            categoryName={drawerState.cell.category_name}
            tierName={drawerState.cell.tier}
            targetType={drawerState.targetType}
            onSave={handleSaveRule}
            onDelete={handleDeleteRule}
            onClose={handleDrawerClose}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default PricingMatrix;
