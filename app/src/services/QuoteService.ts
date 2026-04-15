import type { Quote, QuoteState, CreateQuoteRequest, QuoteAnalytics } from '../types/quote';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const QuoteService = {
    async createQuote(request: CreateQuoteRequest): Promise<Quote> {
        const response = await fetchWithAuth(`${API_URL}/quotes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create quote');
        }

        return response.json();
    },

    async getQuote(id: string): Promise<Quote> {
        const response = await fetchWithAuth(`${API_URL}/quotes/${id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch quote');
        }
        return response.json();
    },

    async listQuotes(): Promise<Quote[]> {
        const response = await fetchWithAuth(`${API_URL}/quotes`);
        if (!response.ok) {
            throw new Error('Failed to fetch quotes');
        }
        return response.json();
    },

    async updateQuoteState(quoteId: string, state: QuoteState): Promise<Quote> {
        const response = await fetchWithAuth(`${API_URL}/quotes/${quoteId}/state`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || 'Failed to update quote state');
        }
        return response.json();
    },

    async getAnalytics(): Promise<QuoteAnalytics> {
        const response = await fetchWithAuth(`${API_URL}/quotes/analytics`);
        if (!response.ok) {
            throw new Error('Failed to fetch quote analytics');
        }
        return response.json();
    },

    getOriginalFileUrl(quoteId: string): string {
        return `${API_URL}/quotes/${quoteId}/file`;
    },

    async updateQuote(id: string, request: CreateQuoteRequest): Promise<Quote> {
        const response = await fetchWithAuth(`${API_URL}/quotes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || 'Failed to update quote');
        }
        return response.json();
    },

    async convertToOrder(quoteId: string): Promise<{ customer_id: string; quote_id: string; lines: { product_id: string; quantity: number; price_each: number }[] }> {
        const response = await fetchWithAuth(`${API_URL}/quotes/${quoteId}/convert`, {
            method: 'POST',
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || 'Failed to convert quote to order');
        }
        return response.json();
    }
};
