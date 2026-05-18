import type { CalculatedPrice, MarketIndex, EscalationRequest, EscalationResult } from '../types/pricing';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const PricingService = {
    calculatePrice: async (customerId: string, productId: string, quantity?: number, jobId?: string): Promise<CalculatedPrice> => {
        const params = new URLSearchParams({
            customer_id: customerId,
            product_id: productId,
        });
        if (quantity && quantity > 0) {
            params.set('quantity', quantity.toString());
        }
        if (jobId) {
            params.set('job_id', jobId);
        }
        const response = await fetchWithAuth(`${API_URL}/api/v1/pricing/calculate?${params.toString()}`);
        if (!response.ok) {
            throw new Error('Failed to calculate price');
        }
        return response.json() as Promise<CalculatedPrice>;
    },

    getMarketIndices: async (): Promise<MarketIndex[]> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/market-indices`);
        if (!response.ok) {
            throw new Error('Failed to fetch market indices');
        }
        return response.json() as Promise<MarketIndex[]>;
    },

    calculateEscalation: async (request: EscalationRequest): Promise<EscalationResult> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pricing/calculate-escalation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            throw new Error('Failed to calculate escalation');
        }
        return response.json() as Promise<EscalationResult>;
    },
};
