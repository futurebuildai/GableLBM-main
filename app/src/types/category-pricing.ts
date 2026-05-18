export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  path: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  children?: ProductCategory[];
}

export type TargetType = 'ACCOUNT' | 'TIER';
export type CategoryRuleType = 'MARKUP' | 'MARKDOWN' | 'FIXED' | 'MARGIN';

export interface CategoryPricingRule {
  id: string;
  target_type: TargetType;
  customer_id?: string;
  tier?: string;
  category_id: string;
  rule_type: CategoryRuleType;
  rule_value: number;
  margin_floor_pct?: number;
  starts_at?: string;
  expires_at?: string;
  is_active: boolean;
  priority: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  category_name?: string;
  category_path?: string;
  customer_name?: string;
}

export interface MatrixCell {
  category_id: string;
  category_name: string;
  category_path: string;
  tier: string;
  rule?: CategoryPricingRule;
  inherited: boolean;
  source_path?: string;
}

export interface MatrixResponse {
  categories: ProductCategory[];
  tiers: string[];
  cells: MatrixCell[];
}

export interface ResolvedCategoryPrice {
  rule?: CategoryPricingRule;
  match_type: string;
  category_path: string;
}

export interface CategoryPricingAudit {
  id: string;
  rule_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  performed_by: string;
  performed_at: string;
  category_id?: string;
  target_type?: string;
  tier?: string;
  customer_id?: string;
}

export interface PaginatedRulesResponse {
  data: CategoryPricingRule[];
  total: number;
  limit: number;
  offset: number;
}
