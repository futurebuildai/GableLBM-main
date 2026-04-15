import type { Inventory } from '../types/product';
import { fetchWithAuth } from './fetchClient';

export interface StockAdjustmentRequest {
    product_id: string;
    location_id?: string;
    quantity: number;
    reason: string;
    is_delta: boolean;
}

export interface StockMovementRequest {
    product_id: string;
    from_location_id: string;
    to_location_id: string;
    quantity: number;
    reason: string;
    is_delta?: boolean; // Added matching what likely exists or removing
}

const API_URL = import.meta.env.VITE_API_URL || '';

export const InventoryService = {
    async adjustStock(data: StockAdjustmentRequest): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/inventory/adjust`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error('Failed to adjust stock');
        }
    },

    async transferStock(data: StockMovementRequest): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/inventory/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error('Failed to transfer stock');
        }
    },

    async getInventoryByProduct(productId: string): Promise<Inventory[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/inventory?product_id=${productId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch inventory');
        }
        return response.json();
    }
};
