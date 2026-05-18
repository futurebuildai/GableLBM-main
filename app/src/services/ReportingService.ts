import type { DailyTillReport, SalesSummaryReport } from '../types/reporting';
import type { ARAgingReport, CustomerStatement, CreditMemo } from '../types/invoice';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const ReportingService = {
    async getDailyTill(date?: string): Promise<DailyTillReport> {
        const params = new URLSearchParams();
        if (date) params.set('date', date);
        const qs = params.toString();
        const url = `${API_URL}/api/v1/reports/daily-till${qs ? `?${qs}` : ''}`;
        const response = await fetchWithAuth(url);
        if (!response.ok) throw new Error('Failed to fetch daily till');
        return response.json();
    },

    async getSalesSummary(start?: string, end?: string): Promise<SalesSummaryReport> {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const qs = params.toString();
        const url = `${API_URL}/api/v1/reports/sales-summary${qs ? `?${qs}` : ''}`;
        const response = await fetchWithAuth(url);
        if (!response.ok) throw new Error('Failed to fetch sales summary');
        return response.json();
    },

    async getARAgingReport(): Promise<ARAgingReport> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/reports/ar-aging`);
        if (!response.ok) throw new Error('Failed to fetch AR aging report');
        return response.json();
    },

    async getCustomerStatement(customerId: string, start?: string, end?: string): Promise<CustomerStatement> {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const qs = params.toString();
        const url = `${API_URL}/api/v1/reports/customer-statement/${customerId}${qs ? `?${qs}` : ''}`;
        const response = await fetchWithAuth(url);
        if (!response.ok) throw new Error('Failed to fetch customer statement');
        return response.json();
    },

    async createCreditMemo(invoiceId: string, amount: number, reason: string): Promise<CreditMemo> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/invoices/${invoiceId}/credit-memo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, reason }),
        });
        if (!response.ok) throw new Error('Failed to create credit memo');
        return response.json();
    }
};
