import type {
  AcknowledgmentPayload,
  CustomerEscalationPolicy,
  EscalateNowResult,
  ExposureSummary,
  IndexHistoryResponse,
  IndexRefreshPreview,
  IndexRefreshRequest,
  ListExposureResponse,
  MarketIndexFull,
  OverridePayload,
  PortfolioSummary,
  QuoteExposureDetail,
} from '../types/exposure';
import { fetchWithAuth } from './fetchClient';

const API = import.meta.env.VITE_API_URL || '';

// All routes prefixed with /api/v1 except the customer policy endpoints,
// which sit under /customers/{id}/escalation-policy to match the existing
// customer module's routing convention (no /api/v1 prefix on customer routes).

export const ExposureService = {
  // ── Salesperson / owner list views ───────────────────────────────────

  async listExposure(params: {
    owner?: 'me' | 'all' | string;
    state?: string[];
    customerId?: string;
    indexCode?: string;
    minDollars?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<ListExposureResponse> {
    const q = new URLSearchParams();
    if (params.owner) q.set('owner', params.owner);
    if (params.state?.length) q.set('state', params.state.join(','));
    if (params.customerId) q.set('customer_id', params.customerId);
    if (params.indexCode) q.set('index_code', params.indexCode);
    if (params.minDollars != null) q.set('min_dollars', String(params.minDollars));
    if (params.limit != null) q.set('limit', String(params.limit));
    if (params.offset != null) q.set('offset', String(params.offset));
    const res = await fetchWithAuth(`${API}/api/v1/quotes/exposure?${q.toString()}`);
    if (!res.ok) throw new Error('Failed to load exposure list');
    return res.json();
  },

  async listExposureSummary(owner: 'me' | 'all' = 'me'): Promise<ExposureSummary> {
    const q = new URLSearchParams({ owner, summary: 'true' });
    const res = await fetchWithAuth(`${API}/api/v1/quotes/exposure?${q.toString()}`);
    if (!res.ok) throw new Error('Failed to load exposure summary');
    return res.json();
  },

  async getQuoteExposure(quoteId: string): Promise<QuoteExposureDetail> {
    const res = await fetchWithAuth(`${API}/api/v1/quotes/${quoteId}/exposure`);
    if (!res.ok) throw new Error('Failed to load quote exposure');
    return res.json();
  },

  // ── Per-quote actions ─────────────────────────────────────────────────

  async acknowledge(quoteId: string, payload: AcknowledgmentPayload): Promise<{ event_id: string }> {
    const res = await fetchWithAuth(`${API}/api/v1/quotes/${quoteId}/exposure/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to acknowledge');
    }
    return res.json();
  },

  async requestAck(quoteId: string): Promise<{ event_id: string; salesperson_notified: boolean }> {
    const res = await fetchWithAuth(`${API}/api/v1/quotes/${quoteId}/exposure/request-ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_screen: 'QUOTE_TO_ORDER_BLOCKER' }),
    });
    if (!res.ok) throw new Error('Failed to request acknowledgment');
    return res.json();
  },

  async override(quoteId: string, payload: OverridePayload): Promise<{ event_id: string }> {
    const res = await fetchWithAuth(`${API}/api/v1/quotes/${quoteId}/exposure/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to override');
    }
    return res.json();
  },

  async escalateNowPreview(quoteId: string): Promise<EscalateNowResult> {
    const res = await fetchWithAuth(`${API}/api/v1/quotes/${quoteId}/exposure/escalate-now`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to compute escalate-now preview');
    return res.json();
  },

  // ── Owner portfolio ──────────────────────────────────────────────────

  async reportExposure(opts: { summary?: boolean } = {}): Promise<PortfolioSummary> {
    const q = new URLSearchParams();
    if (opts.summary) q.set('summary', 'true');
    const res = await fetchWithAuth(`${API}/api/v1/reports/exposure?${q.toString()}`);
    if (!res.ok) throw new Error('Failed to load portfolio rollup');
    return res.json();
  },

  // ── Market indices admin ─────────────────────────────────────────────

  async listIndices(): Promise<MarketIndexFull[]> {
    const res = await fetchWithAuth(`${API}/api/v1/market-indices`);
    if (!res.ok) throw new Error('Failed to load market indices');
    return res.json();
  },

  async refreshIndex(indexId: string, payload: IndexRefreshRequest): Promise<unknown> {
    const res = await fetchWithAuth(`${API}/api/v1/market-indices/${indexId}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to apply index update');
    }
    return res.json();
  },

  async previewIndexRefresh(indexId: string, payload: IndexRefreshRequest): Promise<IndexRefreshPreview> {
    const res = await fetchWithAuth(`${API}/api/v1/market-indices/${indexId}/refresh/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to preview impact');
    }
    return res.json();
  },

  async updateIndex(indexId: string, payload: { name?: string; description?: string; is_active?: boolean }): Promise<MarketIndexFull> {
    const res = await fetchWithAuth(`${API}/api/v1/market-indices/${indexId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update index');
    return res.json();
  },

  async getIndexHistory(indexId: string, days = 90): Promise<IndexHistoryResponse> {
    const res = await fetchWithAuth(`${API}/api/v1/market-indices/${indexId}/history?days=${days}`);
    if (!res.ok) throw new Error('Failed to load history');
    return res.json();
  },

  // ── Customer policy ──────────────────────────────────────────────────
  // These routes don't use /api/v1 to match the existing customer module
  // convention (see backend/internal/customer/handler.go).

  async getCustomerPolicy(customerId: string): Promise<CustomerEscalationPolicy> {
    const res = await fetchWithAuth(`${API}/customers/${customerId}/escalation-policy`);
    if (!res.ok) throw new Error('Failed to load customer policy');
    return res.json();
  },

  async updateCustomerPolicy(customerId: string, payload: CustomerEscalationPolicy): Promise<CustomerEscalationPolicy> {
    const res = await fetchWithAuth(`${API}/customers/${customerId}/escalation-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to update customer policy');
    }
    return res.json();
  },
};
