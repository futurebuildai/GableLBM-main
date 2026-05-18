// Types for the Lumber Index-Aware Quote Price Protection feature.
// Mirrors backend/internal/pricing/exposure_model.go shapes.

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

export type EventType =
  | 'DETECTED'
  | 'FLAGGED'
  | 'ESCALATED'
  | 'ACK_REQUIRED'
  | 'ACK_REQUESTED'
  | 'ACKNOWLEDGED'
  | 'CLEARED'
  | 'BLOCKED'
  | 'OVERRIDDEN';

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
  policy: EscalationPolicy;
  exposure_state: ExposureState;
  available_actions: string[];
}

export interface ListExposureResponse {
  items: ExposureRow[];
  total: number;
}

export interface ExposureSummary {
  count: number;
  total_dollars: number;
}

export interface QuoteExposureEvent {
  id: string;
  quote_id: string;
  quote_line_id?: string;
  market_index_id?: string;
  market_index_history_id?: string;
  event_type: EventType;
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
  idempotency_key: string;
  created_at: string;
}

export interface QuoteExposureDetail {
  quote_id: string;
  exposure_state: ExposureState;
  exposure_dollars: number;
  last_checked_at?: string;
  indexes: string[];
  events: QuoteExposureEvent[];
}

export interface AcknowledgmentPayload {
  method: AckMethod;
  customer_contact?: string;
  notes: string;
}

export interface OverridePayload {
  notes: string;
}

export interface EscalateNowLine {
  quote_line_id: string;
  current_unit_price: number;
  suggested_unit_price: number;
  delta_pct: number;
}

export interface EscalateNowResult {
  quote_id: string;
  lines: EscalateNowLine[];
  estimated_new_total: number;
}

export interface PortfolioCustomerRow {
  customer_id: string;
  customer_name: string;
  quote_count: number;
  exposure_dollars: number;
  top_index_code?: string;
  policy: EscalationPolicy;
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

export interface PortfolioSummary {
  total_exposure_dollars: number;
  total_quotes: number;
  total_customers: number;
  delta_vs_prior_week_dollars: number;
  by_customer?: PortfolioCustomerRow[];
  by_salesperson?: PortfolioSalespersonRow[];
  trend?: { date: string; exposure_dollars: number }[];
}

export interface MarketIndexFull {
  id: string;
  index_code: string;
  name: string;
  source: string;
  current_value: number;
  // Backend marshals `*float64` with omitempty, so the key is absent (undefined)
  // when there's no previous value rather than null. Consumers that rely on
  // strict-nullability should treat both forms equivalently.
  previous_value?: number;
  unit: string;
  commodity_kind?: string;
  description?: string;
  is_active: boolean;
  last_updated_at: string;
  created_at: string;
}

export interface IndexRefreshRequest {
  new_value: number;
  source: string;
  notes?: string;
}

export interface IndexRefreshPreview {
  delta_pct: number;
  affected_quote_count: number;
  estimated_exposure_dollars: number;
  affected_customer_count: number;
  top_customers: {
    customer_id: string;
    customer_name: string;
    exposure_dollars: number;
    quote_count: number;
  }[];
}

export interface IndexHistoryResponse {
  market_index_id: string;
  from: string;
  to: string;
  points: {
    id: string;
    market_index_id: string;
    value: number;
    recorded_at: string;
    recorded_by?: string;
    source: string;
  }[];
}

export interface CustomerEscalationPolicy {
  customer_id: string;
  price_escalation_policy: EscalationPolicy;
  escalation_threshold_pct: number;
  escalation_agreement_signed_at?: string | null;
  escalation_agreement_ref?: string;
}

export interface UnresolvedExposurePayload {
  error: string;
  code: 'UNRESOLVED_EXPOSURE';
  exposure: {
    quote_id: string;
    quote_short_id: string;
    state: ExposureState;
    exposure_dollars: number;
    indexes: string[];
    salesperson_id?: string;
    salesperson_name?: string;
    required_action: string;
    last_checked_at?: string;
  };
}
