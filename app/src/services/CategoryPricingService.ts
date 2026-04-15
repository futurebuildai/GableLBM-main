import type { ProductCategory, CategoryPricingRule, MatrixResponse, ResolvedCategoryPrice, CategoryPricingAudit, PaginatedRulesResponse } from '../types/category-pricing';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const categoryPricingService = {
  // --- Categories ---
  listCategories: async (view: 'tree' | 'flat' = 'tree'): Promise<ProductCategory[]> => {
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/categories?view=${view}`);
    if (!res.ok) throw new Error('Failed to load categories');
    return res.json();
  },

  createCategory: async (data: Partial<ProductCategory>): Promise<ProductCategory> => {
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create category');
    return res.json();
  },

  updateCategory: async (id: string, data: Partial<ProductCategory>): Promise<ProductCategory> => {
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update category');
    return res.json();
  },

  // --- Rules ---
  listRules: async (params?: Record<string, string>): Promise<CategoryPricingRule[]> => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/category-rules${query}`);
    if (!res.ok) throw new Error('Failed to load rules');
    return (await res.json()) ?? [];
  },

  listRulesPaginated: async (params?: Record<string, string>): Promise<PaginatedRulesResponse> => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/category-rules${query}`);
    if (!res.ok) throw new Error('Failed to load rules');
    return res.json();
  },

  createRule: async (rule: Partial<CategoryPricingRule>): Promise<CategoryPricingRule> => {
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/category-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to create rule');
    }
    return res.json();
  },

  updateRule: async (id: string, rule: Partial<CategoryPricingRule>): Promise<CategoryPricingRule> => {
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/category-rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    if (!res.ok) throw new Error('Failed to update rule');
    return res.json();
  },

  deleteRule: async (id: string): Promise<void> => {
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/category-rules/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete rule');
  },

  // --- Bulk ---
  bulkUpsertRules: async (rules: Partial<CategoryPricingRule>[]): Promise<{ count: number }> => {
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/category-rules/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rules),
    });
    if (!res.ok) throw new Error('Failed to bulk upsert rules');
    return res.json();
  },

  bulkDeleteRules: async (ids: string[]): Promise<void> => {
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/category-rules/bulk`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error('Failed to bulk delete rules');
  },

  // --- Audit ---
  getRuleAudit: async (ruleId: string): Promise<CategoryPricingAudit[]> => {
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/category-rules/${ruleId}/audit`);
    if (!res.ok) throw new Error('Failed to load audit trail');
    return res.json();
  },

  // --- Matrix ---
  getMatrix: async (): Promise<MatrixResponse> => {
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/matrix`);
    if (!res.ok) throw new Error('Failed to load matrix');
    return res.json();
  },

  // --- Resolution Preview ---
  resolvePreview: async (productId: string, customerId?: string, tier?: string): Promise<ResolvedCategoryPrice> => {
    const params = new URLSearchParams({ product_id: productId });
    if (customerId) params.set('customer_id', customerId);
    if (tier) params.set('tier', tier);
    const res = await fetchWithAuth(`${API_URL}/api/v1/pricing/resolve?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to resolve price');
    return res.json();
  },
};
