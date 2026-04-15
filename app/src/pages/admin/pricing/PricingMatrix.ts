import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons';
import { LayoutGrid, RefreshCw, ChevronDown, ChevronRight, AlertTriangle, Plus, User, Grid3X3, X } from 'lucide';
import { categoryPricingService } from '../../../services/CategoryPricingService';
import { ToastService } from '../../../lib/toast-service';
import { cn } from '../../../lib/utils';
import type { ProductCategory, MatrixCell, MatrixResponse, CategoryPricingRule, CategoryRuleType } from '../../../types/category-pricing';

// Import child components so they register their custom elements
import './CategoryTree.ts';
import './MatrixGrid.ts';
import './RuleDrawer.ts';
import './ResolutionPreview.ts';
import './AccountRulesTable.ts';

type Tab = 'matrix' | 'accounts';

@customElement('gable-pricing-matrix')
export class GablePricingMatrix extends LitElement {
  createRenderRoot() { return this; }

  @state() private _matrix: MatrixResponse | null = null;
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _selectedCategory: string | null = null;

  @state() private _drawerOpen = false;
  @state() private _drawerCell: MatrixCell | null = null;
  @state() private _drawerTargetType?: 'TIER' | 'ACCOUNT';

  @state() private _showPreview = false;
  @state() private _activeTab: Tab = 'matrix';
  @state() private _accountRules: CategoryPricingRule[] = [];
  @state() private _accountRulesLoading = false;

  // Bulk mode state
  @state() private _bulkMode = false;
  @state() private _selectedCells: Set<string> = new Set();
  @state() private _bulkRuleType: CategoryRuleType = 'MARKDOWN';
  @state() private _bulkRuleValue = '';

  connectedCallback() {
    super.connectedCallback();
    this._loadMatrix();
  }

  private async _loadMatrix() {
    this._loading = true;
    this._error = null;
    try {
      const data = await categoryPricingService.getMatrix();
      this._matrix = data;
    } catch (err) {
      console.error('Failed to load pricing matrix:', err);
      this._error = err instanceof Error ? err.message : 'Failed to load pricing matrix';
    } finally {
      this._loading = false;
    }
  }

  private async _loadAccountRules() {
    this._accountRulesLoading = true;
    try {
      const rules = await categoryPricingService.listRules({ target_type: 'ACCOUNT' });
      this._accountRules = rules;
    } catch (err) {
      console.error('Failed to load account rules:', err);
    } finally {
      this._accountRulesLoading = false;
    }
  }

  private _setActiveTab(tab: Tab) {
    this._activeTab = tab;
    if (tab === 'accounts') {
      this._loadAccountRules();
    }
  }

  private _handleCellClick(e: CustomEvent<MatrixCell>) {
    if (this._bulkMode) return;
    const cell = e.detail;
    if (cell.inherited && cell.rule) {
      const { id: _parentId, ...ruleWithoutId } = cell.rule;
      const overrideCell: MatrixCell = {
        ...cell,
        rule: ruleWithoutId as MatrixCell['rule'],
        inherited: false,
      };
      this._drawerCell = overrideCell;
    } else {
      this._drawerCell = cell;
    }
    this._drawerOpen = true;
    this._drawerTargetType = undefined;
  }

  private _handleCellToggle(e: CustomEvent<string>) {
    const key = e.detail;
    const next = new Set(this._selectedCells);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this._selectedCells = next;
  }

  private _handleDrawerClose() {
    this._drawerOpen = false;
    this._drawerCell = null;
    this._drawerTargetType = undefined;
  }

  private async _handleSaveRule(e: CustomEvent<Partial<CategoryPricingRule>>) {
    const rule = e.detail;
    const cell = this._drawerCell;
    if (!cell) return;

    try {
      if (rule.id) {
        await categoryPricingService.updateRule(rule.id, rule);
        ToastService.show('Rule updated successfully', 'success');
      } else {
        await categoryPricingService.createRule({
          ...rule,
          target_type: rule.target_type || 'TIER',
          tier: rule.target_type === 'ACCOUNT' ? undefined : cell.tier,
          category_id: cell.category_id,
          is_active: true,
        });
        ToastService.show('Rule created successfully', 'success');
      }
      this._handleDrawerClose();
      await this._loadMatrix();
      if (this._activeTab === 'accounts') await this._loadAccountRules();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save rule';
      ToastService.show(message, 'error');
    }
  }

  private async _handleDeleteRule(e: CustomEvent<string>) {
    const id = e.detail;
    try {
      await categoryPricingService.deleteRule(id);
      ToastService.show('Rule deleted', 'success');
      this._handleDrawerClose();
      await this._loadMatrix();
      if (this._activeTab === 'accounts') await this._loadAccountRules();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete rule';
      ToastService.show(message, 'error');
    }
  }

  private _handleCategorySelect(e: CustomEvent<ProductCategory>) {
    const category = e.detail;
    this._selectedCategory = category.id === this._selectedCategory ? null : category.id;
  }

  private async _handleBulkApply() {
    const value = parseFloat(this._bulkRuleValue);
    if (isNaN(value) || this._selectedCells.size === 0 || !this._matrix) return;

    const rules: Partial<CategoryPricingRule>[] = [];
    for (const key of this._selectedCells) {
      const [catId, tier] = key.split(':');
      rules.push({
        target_type: 'TIER',
        tier,
        category_id: catId,
        rule_type: this._bulkRuleType,
        rule_value: value,
        is_active: true,
      });
    }

    try {
      const result = await categoryPricingService.bulkUpsertRules(rules);
      ToastService.show(`${result.count} rules applied`, 'success');
      this._bulkMode = false;
      this._selectedCells = new Set();
      this._bulkRuleValue = '';
      await this._loadMatrix();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bulk operation failed';
      ToastService.show(message, 'error');
    }
  }

  private _handleExitBulkMode() {
    this._bulkMode = false;
    this._selectedCells = new Set();
    this._bulkRuleValue = '';
  }

  private _handleEditAccountRule(e: CustomEvent<CategoryPricingRule>) {
    const rule = e.detail;
    const cell: MatrixCell = {
      category_id: rule.category_id,
      category_name: rule.category_name || '',
      category_path: rule.category_path || '',
      tier: '',
      rule,
      inherited: false,
    };
    this._drawerCell = cell;
    this._drawerTargetType = 'ACCOUNT';
    this._drawerOpen = true;
  }

  private _handleNewAccountRule() {
    const cell: MatrixCell = {
      category_id: this._matrix?.categories?.[0]?.id || '',
      category_name: this._matrix?.categories?.[0]?.name || '',
      category_path: this._matrix?.categories?.[0]?.path || '',
      tier: '',
      rule: undefined,
      inherited: false,
    };
    this._drawerCell = cell;
    this._drawerTargetType = 'ACCOUNT';
    this._drawerOpen = true;
  }

  render() {
    return html`
      <div class="min-h-screen bg-deep-space p-8 space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              ${icon(LayoutGrid, 32, 'w-8 h-8 text-gable-green')}
              Pricing Matrix
            </h1>
            <p class="text-slate-400 mt-1">
              Configure tier and account-level pricing rules by product category.
            </p>
          </div>
          <div class="flex items-center gap-2">
            ${this._activeTab === 'matrix' && !this._bulkMode ? html`
              <button
                @click=${() => { this._bulkMode = true; }}
                class="inline-flex items-center gap-2 px-4 py-2 border border-white/10 text-white rounded hover:bg-white/5 text-sm"
              >
                ${icon(Grid3X3, 14)}
                Bulk Edit
              </button>
            ` : nothing}
            <button
              @click=${() => this._loadMatrix()}
              ?disabled=${this._loading}
              class="inline-flex items-center gap-2 px-4 py-2 border border-white/10 text-white rounded hover:bg-white/5 text-sm"
            >
              ${icon(RefreshCw, 14, cn(this._loading && 'animate-spin'))}
              Refresh
            </button>
          </div>
        </div>

        <!-- Tab Bar -->
        <div class="flex items-center gap-1 bg-white/[0.03] rounded-lg p-1 w-fit">
          <button
            @click=${() => this._setActiveTab('matrix')}
            class=${cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              this._activeTab === 'matrix'
                ? 'bg-gable-green/10 text-gable-green'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            )}
          >
            ${icon(Grid3X3, 14, 'inline mr-1.5')}
            Tier Matrix
          </button>
          <button
            @click=${() => this._setActiveTab('accounts')}
            class=${cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              this._activeTab === 'accounts'
                ? 'bg-gable-green/10 text-gable-green'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            )}
          >
            ${icon(User, 14, 'inline mr-1.5')}
            Account Rules
            ${this._accountRules.length > 0 ? html`
              <span class="ml-1.5 text-xs bg-white/10 px-1.5 py-0.5 rounded">
                ${this._accountRules.length}
              </span>
            ` : nothing}
          </button>
        </div>

        <!-- Bulk Mode Toolbar -->
        ${this._bulkMode ? html`
          <div class="bg-gable-green/5 border border-gable-green/20 rounded-lg px-4 py-3 flex items-center gap-4">
            <span class="text-sm text-gable-green font-medium">
              ${this._selectedCells.size} cell${this._selectedCells.size !== 1 ? 's' : ''} selected
            </span>
            <select
              .value=${this._bulkRuleType}
              @change=${(e: Event) => { this._bulkRuleType = (e.target as HTMLSelectElement).value as CategoryRuleType; }}
              class="bg-deep-space border border-white/10 rounded px-2 py-1.5 text-white text-sm"
            >
              <option value="MARKDOWN">MARKDOWN</option>
              <option value="MARKUP">MARKUP</option>
              <option value="MARGIN">MARGIN</option>
              <option value="FIXED">FIXED</option>
            </select>
            <input
              type="number"
              step="0.01"
              .value=${this._bulkRuleValue}
              @input=${(e: Event) => { this._bulkRuleValue = (e.target as HTMLInputElement).value; }}
              placeholder="Value"
              class="w-24 bg-deep-space border border-white/10 rounded px-2 py-1.5 text-white font-mono text-sm"
            />
            <button
              @click=${this._handleBulkApply}
              ?disabled=${this._selectedCells.size === 0 || !this._bulkRuleValue}
              class="px-4 py-2 bg-gable-green text-black font-semibold rounded hover:shadow-glow disabled:opacity-50 text-sm"
            >
              Apply to Selected
            </button>
            <button @click=${this._handleExitBulkMode} class="text-slate-400 hover:text-white p-1 ml-auto">
              ${icon(X, 16)}
            </button>
          </div>
        ` : nothing}

        <!-- Legend -->
        ${this._activeTab === 'matrix' ? html`
          <div class="flex items-center gap-6 text-xs text-slate-400">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded bg-gable-green/20 border border-gable-green/30"></div>
              Direct rule
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded bg-blueprint-blue/20 border border-blueprint-blue/30"></div>
              Inherited from ancestor
            </div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-gable-green/20 text-gable-green">
                A
              </span>
              Account-specific
            </div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-blueprint-blue/20 text-blueprint-blue">
                T
              </span>
              Tier-wide
            </div>
          </div>
        ` : nothing}

        <!-- Error Banner -->
        ${this._error ? html`
          <div class="bg-safety-red/5 border border-safety-red/20 rounded-lg px-4 py-3 flex items-center gap-3">
            ${icon(AlertTriangle, 18, 'text-safety-red shrink-0')}
            <div class="flex-1">
              <p class="text-sm text-safety-red font-medium">Failed to load pricing matrix</p>
              <p class="text-xs text-slate-400 mt-0.5">
                Make sure the backend is running with <code class="font-mono text-blueprint-blue">CATEGORY_PRICING_ENABLED=true</code> and migrations 049-052 have been applied.
              </p>
            </div>
            <button
              @click=${() => this._loadMatrix()}
              ?disabled=${this._loading}
              class="inline-flex items-center gap-2 px-4 py-2 border border-white/10 text-white rounded hover:bg-white/5 text-sm shrink-0"
            >
              ${icon(RefreshCw, 14, cn(this._loading && 'animate-spin'))}
              Retry
            </button>
          </div>
        ` : nothing}

        <!-- Main Content -->
        ${this._activeTab === 'matrix' ? html`
          <div class="flex gap-6">
            <!-- Category Tree (Left Sidebar) -->
            <div class="w-[260px] shrink-0 bg-slate-steel border border-white/5 rounded-lg p-4 max-h-[calc(100vh-280px)] overflow-y-auto">
              ${this._loading && !this._matrix ? html`
                <div class="flex items-center gap-2 text-slate-500 text-sm p-4">
                  ${icon(RefreshCw, 14, 'animate-spin')}
                  Loading categories...
                </div>
              ` : this._matrix ? html`
                <gable-category-tree
                  .categories=${this._matrix.categories}
                  .selectedId=${this._selectedCategory}
                  @category-select=${this._handleCategorySelect}
                ></gable-category-tree>
              ` : html`
                <div class="text-slate-500 text-sm p-4">No categories loaded.</div>
              `}
            </div>

            <!-- Matrix Grid (Center) -->
            <div class="flex-1 min-w-0">
              ${this._loading && !this._matrix ? html`
                <div class="bg-slate-steel border border-white/5 rounded-lg p-12 text-center">
                  ${icon(RefreshCw, 32, 'w-8 h-8 text-slate-500 mx-auto mb-4 animate-spin')}
                  <p class="text-slate-400">Loading pricing matrix...</p>
                </div>
              ` : this._matrix ? html`
                <gable-matrix-grid
                  .categories=${this._matrix.categories}
                  .tiers=${this._matrix.tiers}
                  .cells=${this._matrix.cells}
                  ?bulk-mode=${this._bulkMode}
                  .selectedCells=${this._selectedCells}
                  @cell-click=${this._handleCellClick}
                  @cell-toggle=${this._handleCellToggle}
                ></gable-matrix-grid>
              ` : html`
                <div class="bg-slate-steel border border-white/5 rounded-lg p-12 text-center">
                  ${icon(LayoutGrid, 32, 'w-8 h-8 text-slate-500 mx-auto mb-4')}
                  <p class="text-slate-400">No pricing data available.</p>
                  <p class="text-slate-500 text-sm mt-1">
                    Enable the category pricing engine with <code class="font-mono text-blueprint-blue">CATEGORY_PRICING_ENABLED=true</code>
                  </p>
                </div>
              `}
            </div>
          </div>
        ` : html`
          <!-- Account Rules Tab -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-white">Account-Specific Pricing Rules</h2>
              <button
                @click=${this._handleNewAccountRule}
                class="inline-flex items-center gap-2 px-4 py-2 bg-gable-green text-black font-semibold rounded hover:shadow-glow text-sm"
              >
                ${icon(Plus, 14)}
                New Account Rule
              </button>
            </div>
            ${this._accountRulesLoading ? html`
              <div class="flex items-center gap-2 text-slate-500 text-sm p-8 justify-center">
                ${icon(RefreshCw, 14, 'animate-spin')}
                Loading account rules...
              </div>
            ` : html`
              <gable-account-rules-table
                .rules=${this._accountRules}
                @edit-rule=${this._handleEditAccountRule}
                @delete-rule=${this._handleDeleteRule}
              ></gable-account-rules-table>
            `}
          </div>
        `}

        <!-- Resolution Preview (Collapsible) -->
        <div>
          <button
            @click=${() => { this._showPreview = !this._showPreview; }}
            class="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            ${this._showPreview ? icon(ChevronDown, 16) : icon(ChevronRight, 16)}
            Resolution Preview
          </button>
          ${this._showPreview ? html`
            <div class="mt-3">
              <gable-resolution-preview></gable-resolution-preview>
            </div>
          ` : nothing}
        </div>

        <!-- Rule Drawer -->
        ${this._drawerOpen && this._drawerCell ? html`
          <gable-rule-drawer
            .rule=${this._drawerCell.rule || {
              target_type: this._drawerTargetType || 'TIER',
              tier: this._drawerCell.tier,
              category_id: this._drawerCell.category_id,
            }}
            category-name=${this._drawerCell.category_name}
            tier-name=${this._drawerCell.tier}
            target-type=${this._drawerTargetType || ''}
            @save-rule=${this._handleSaveRule}
            @delete-rule=${this._handleDeleteRule}
            @close-drawer=${this._handleDrawerClose}
          ></gable-rule-drawer>
        ` : nothing}
      </div>
    `;
  }
}
