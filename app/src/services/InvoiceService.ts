import type { Invoice } from '../types/invoice';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const InvoiceService = {
    async listInvoices(): Promise<Invoice[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/invoices`);
        if (!response.ok) {
            throw new Error('Failed to fetch invoices');
        }
        const payload = await response.json();
        return Array.isArray(payload) ? payload : (payload?.data ?? []);
    },

    async getInvoice(id: string): Promise<Invoice> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/invoices/${id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch invoice');
        }
        return response.json();
    },

    async emailInvoice(id: string): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/invoices/${id}/email`, {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error('Failed to email invoice');
        }
    }
};
