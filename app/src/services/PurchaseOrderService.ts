import type { PurchaseOrder, CreatePORequest, ReceivePORequest, RecommendationSummary, FreightCharge, FreightUploadResponse, POSourceSummary } from '../types/purchaseOrder';
import type { ReorderAlert } from '../types/product';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const PurchaseOrderService = {
    async listPOs(): Promise<PurchaseOrder[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/purchase-orders`);
        if (!response.ok) throw new Error('Failed to fetch purchase orders');
        return response.json();
    },

    async getPO(id: string): Promise<PurchaseOrder> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/purchase-orders/${id}`);
        if (!response.ok) throw new Error('Failed to fetch purchase order');
        return response.json();
    },

    async createPO(request: CreatePORequest): Promise<PurchaseOrder> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/purchase-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create purchase order');
        }
        return response.json();
    },

    async submitPO(id: string): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/purchase-orders/${id}/submit`, {
            method: 'POST',
        });
        if (!response.ok) throw new Error('Failed to submit purchase order');
    },

    async receivePO(id: string, request: ReceivePORequest): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/purchase-orders/${id}/receive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to receive purchase order');
        }
    },

    async getReorderAlerts(): Promise<ReorderAlert[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/products/reorder-alerts`);
        if (!response.ok) throw new Error('Failed to fetch reorder alerts');
        return response.json();
    },

    async generateReorders(): Promise<{ count: number }> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/purchase-orders/reorder-check`, {
            method: 'POST',
        });
        if (!response.ok) throw new Error('Failed to generate reorder POs');
        return response.json();
    },

    async getRecommendations(): Promise<RecommendationSummary> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/purchase-orders/recommendations`);
        if (!response.ok) throw new Error('Failed to fetch purchasing recommendations');
        return response.json();
    },

    async getSourceSummary(): Promise<POSourceSummary> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/purchase-orders/source-summary`);
        if (!response.ok) throw new Error('Failed to fetch PO source summary');
        return response.json();
    },

    async uploadFreightInvoice(poId: string, file: File): Promise<FreightUploadResponse> {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetchWithAuth(`${API_URL}/api/v1/purchase-orders/${poId}/freight`, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to upload freight invoice');
        }
        return response.json();
    },

    async applyFreight(poId: string, freightId: string): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/purchase-orders/${poId}/freight/${freightId}/apply`, {
            method: 'POST',
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to apply freight charge');
        }
    },

    async getFreightCharges(poId: string): Promise<FreightCharge[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/purchase-orders/${poId}/freight`);
        if (!response.ok) throw new Error('Failed to fetch freight charges');
        return response.json();
    },
};
