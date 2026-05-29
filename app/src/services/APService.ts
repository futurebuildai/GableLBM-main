import type {
    VendorInvoice,
    APPayment,
    APAgingSummary,
    CreateVendorInvoiceRequest,
    CreateAPPaymentRequest
} from '../types/ap';
import { fetchWithAuth } from './fetchClient';

const API = import.meta.env.VITE_API_URL || '';

export const APService = {
    async getAgingSummary(): Promise<APAgingSummary[]> {
        const res = await fetchWithAuth(`${API}/api/v1/ap/aging`);
        if (!res.ok) throw new Error('Failed to fetch AP aging summary');
        return res.json();
    },

    async listVendorInvoices(vendorId?: string, status?: string): Promise<VendorInvoice[]> {
        const params = new URLSearchParams();
        if (vendorId) params.set('vendor_id', vendorId);
        if (status) params.set('status', status);
        const qs = params.toString() ? `?${params.toString()}` : '';
        const res = await fetchWithAuth(`${API}/api/v1/ap/invoices${qs}`);
        if (!res.ok) throw new Error('Failed to fetch vendor invoices');
        return res.json();
    },

    async getVendorInvoice(id: string): Promise<VendorInvoice> {
        const res = await fetchWithAuth(`${API}/api/v1/ap/invoices/${id}`);
        if (!res.ok) throw new Error('Failed to fetch vendor invoice details');
        return res.json();
    },

    async createVendorInvoice(req: CreateVendorInvoiceRequest): Promise<VendorInvoice> {
        const res = await fetchWithAuth(`${API}/api/v1/ap/invoices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async approveVendorInvoice(id: string): Promise<VendorInvoice> {
        const res = await fetchWithAuth(`${API}/api/v1/ap/invoices/${id}/approve`, {
            method: 'POST'
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async payVendor(req: CreateAPPaymentRequest): Promise<APPayment> {
        const res = await fetchWithAuth(`${API}/api/v1/ap/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async listPayments(vendorId?: string): Promise<APPayment[]> {
        const params = new URLSearchParams();
        if (vendorId) params.set('vendor_id', vendorId);
        const qs = params.toString() ? `?${params.toString()}` : '';
        const res = await fetchWithAuth(`${API}/api/v1/ap/payments${qs}`);
        if (!res.ok) throw new Error('Failed to fetch AP payments');
        return res.json();
    }
};
