/**
 * Lumber Index-Aware Quote Price Protection — frontend types.
 * Mirrors backend/internal/pricing/exposure_model.go and the JSON shapes
 * returned by the exposure + index-admin handlers.
 */

export type ExposureState =
  | 'OK'
  | 'FLAGGED'
  | 'ESCALATED'
  | 'ACK_REQUIRED'
  | 'ACKNOWLEDGED'
  | 'BLOCKED'
  | 'OVERRIDDEN';

export type EscalationPolicy = 'AUTO_ESCALATE' | 'FLAG_FOR_REQUOTE' | 'REQUIRE_ACK';

export type AckMethod = 'VERBAL' | 'EMAIL' | 'PORTAL';

/** One row of the salesperson at-risk-quotes table (GET /quotes/exposure). */
export interface ExposureRow {
  quote_id: string;
  short_id: string;
  customer_id: string;
  customer_name: string;
  salesperson_id?: string;
  salesperson_name?: string;
  days_open: number;
  indexes: string[];
  max_delta_pct: number;
  exposure_dollars: number;
  policy: string;
  exposure_state: ExposureState;
  available_actions: string[];
}

export interface ExposureListResponse {
  items: ExposureRow[];
  total: number;
}

export interface ExposureSummary {
  count: number;
  total_dollars: number;
}

/** A single append-only entry in the exposure ledger. */
export interface QuoteExposureEvent {
  id: string;
  quote_id: string;
  quote_line_id?: string;
  market_index_id?: string;
  market_index_history_id?: string;
  event_type: string;
  base_index_value?: number;
  current_index_value?: number;
  delta_pct?: number;
  exposure_dollars?: number;
  threshold_pct?: number;
  policy?: string;
  actor_user_id?: string;
  actor_role?: string;
  method?: string;
  notes?: string;
  created_at: string;
}

/** GET /quotes/{id}/exposure */
export interface QuoteExposureDetail {
  quote_id: string;
  exposure_state: ExposureState;
  exposure_dollars: number;
  last_checked_at?: string;
  indexes: string[];
  required_action?: string;
  events: QuoteExposureEvent[];
}

/** GET /reports/exposure */
export interface PortfolioSummary {
  total_exposure_dollars: number;
  total_quotes: number;
  total_customers: number;
  by_customer: PortfolioCustomerRow[];
  by_salesperson: PortfolioSalespersonRow[];
}

export interface PortfolioCustomerRow {
  customer_id: string;
  customer_name: string;
  quote_count: number;
  exposure_dollars: number;
  top_index_code?: string;
  policy: string;
  last_activity_at: string;
}

export interface PortfolioSalespersonRow {
  salesperson_id: string;
  salesperson_name: string;
  quote_count: number;
  exposure_dollars: number;
  flagged_count: number;
  ack_required_count: number;
}

/** A market index (GET /market-indices). */
export interface MarketIndex {
  id: string;
  name: string;
  index_code?: string;
  commodity_kind?: string;
  description?: string;
  current_value?: number;
  unit?: string;
  is_active?: boolean;
  updated_at?: string;
}

/** A point on an index's time-series (GET /market-indices/{id}/history). */
export interface MarketIndexHistory {
  id: string;
  market_index_id: string;
  value: number;
  recorded_at: string;
  recorded_by?: string;
  source: string;
}

export interface AcknowledgmentRequest {
  method: AckMethod;
  customer_contact?: string;
  notes: string;
}

export interface OverrideRequest {
  notes: string;
}

export interface IndexRefreshRequest {
  new_value: number;
  source: string;
  notes?: string;
}

/** Per-customer escalation policy (GET/PUT /customers/{id}/escalation-policy). */
export interface CustomerEscalationPolicy {
  customer_id: string;
  policy: string;
  threshold_pct: number;
  agreement_signed_at?: string;
  agreement_ref?: string;
}
