import { fetchWithAuth } from './fetchClient';
import type {
  ExposureListResponse,
  ExposureSummary,
  QuoteExposureDetail,
  PortfolioSummary,
  MarketIndex,
  MarketIndexHistory,
  AcknowledgmentRequest,
  OverrideRequest,
  IndexRefreshRequest,
  CustomerEscalationPolicy,
} from '../types/exposure';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Client for the Lumber Index-Aware Quote Price Protection API.
 * All calls route through fetchWithAuth (auth + branch headers + 401 handling).
 */
export const ExposureService = {
  // ── Salesperson at-risk view ──────────────────────────────────────
  listAtRisk: async (params: {
    owner?: string;
    state?: string;
    customerId?: string;
    indexCode?: string;
    minDollars?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<ExposureListResponse> => {
    const q = new URLSearchParams();
    if (params.owner) q.set('owner', params.owner);
    if (params.state) q.set('state', params.state);
    if (params.customerId) q.set('customer_id', params.customerId);
    if (params.indexCode) q.set('index_code', params.indexCode);
    if (params.minDollars != null) q.set('min_dollars', String(params.minDollars));
    if (params.limit != null) q.set('limit', String(params.limit));
    if (params.offset != null) q.set('offset', String(params.offset));
    const qs = q.toString();
    return json(await fetchWithAuth(`${API_BASE}/api/v1/quotes/exposure${qs ? `?${qs}` : ''}`));
  },

  atRiskSummary: async (owner = 'me'): Promise<ExposureSummary> => {
    const q = new URLSearchParams({ owner, summary: 'true' });
    return json(await fetchWithAuth(`${API_BASE}/api/v1/quotes/exposure?${q.toString()}`));
  },

  // ── Per-quote detail + actions ────────────────────────────────────
  getQuoteExposure: async (quoteId: string): Promise<QuoteExposureDetail> =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/quotes/${quoteId}/exposure`)),

  acknowledge: async (quoteId: string, req: AcknowledgmentRequest) =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/quotes/${quoteId}/exposure/acknowledge`, {
      method: 'POST',
      body: JSON.stringify(req),
    })),

  requestAck: async (quoteId: string) =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/quotes/${quoteId}/exposure/request-ack`, {
      method: 'POST',
    })),

  override: async (quoteId: string, req: OverrideRequest) =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/quotes/${quoteId}/exposure/override`, {
      method: 'POST',
      body: JSON.stringify(req),
    })),

  escalateNowPreview: async (quoteId: string) =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/quotes/${quoteId}/exposure/escalate-now`, {
      method: 'POST',
    })),

  // ── Owner portfolio rollup ────────────────────────────────────────
  getPortfolio: async (): Promise<PortfolioSummary> =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/reports/exposure`)),

  // ── Market index admin ────────────────────────────────────────────
  listMarketIndices: async (): Promise<MarketIndex[]> =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/market-indices`)),

  getIndexHistory: async (indexId: string): Promise<MarketIndexHistory[]> =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/market-indices/${indexId}/history`)),

  refreshIndex: async (indexId: string, req: IndexRefreshRequest) =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/market-indices/${indexId}/refresh`, {
      method: 'POST',
      body: JSON.stringify(req),
    })),

  previewRefresh: async (indexId: string, req: IndexRefreshRequest) =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/market-indices/${indexId}/refresh/preview`, {
      method: 'POST',
      body: JSON.stringify(req),
    })),

  // ── Customer escalation policy ────────────────────────────────────
  getEscalationPolicy: async (customerId: string): Promise<CustomerEscalationPolicy> =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/customers/${customerId}/escalation-policy`)),

  setEscalationPolicy: async (customerId: string, policy: Partial<CustomerEscalationPolicy>) =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/customers/${customerId}/escalation-policy`, {
      method: 'PUT',
      body: JSON.stringify(policy),
    })),

  // ── Admin scan trigger (safety-net) ───────────────────────────────
  runScan: async () =>
    json(await fetchWithAuth(`${API_BASE}/api/v1/admin/exposure-scan`, { method: 'POST' })),
};
