import type { Order, CreateOrderRequest } from '../types/order';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const OrderService = {
    async createOrder(request: CreateOrderRequest): Promise<Order> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create order');
        }

        return response.json();
    },

    async listOrders(): Promise<Order[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/orders`);
        if (!response.ok) {
            throw new Error('Failed to fetch orders');
        }
        const payload = await response.json();
        return Array.isArray(payload) ? payload : (payload?.data ?? []);
    },

    async getOrder(id: string): Promise<Order> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/orders/${id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch order');
        }
        return response.json();
    },

    async confirmOrder(id: string): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/orders/${id}/confirm`, {
            method: 'POST',
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to confirm order');
        }
    },

    async fulfillOrder(id: string): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/orders/${id}/fulfill`, {
            method: 'POST',
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to fulfill order');
        }
    }
};
