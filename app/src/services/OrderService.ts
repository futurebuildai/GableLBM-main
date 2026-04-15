import type { Order, CreateOrderRequest } from '../types/order';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const OrderService = {
    async createOrder(request: CreateOrderRequest): Promise<Order> {
        const response = await fetchWithAuth(`${API_URL}/orders`, {
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
        const response = await fetchWithAuth(`${API_URL}/orders`);
        if (!response.ok) {
            throw new Error('Failed to fetch orders');
        }
        return response.json();
    },

    async getOrder(id: string): Promise<Order> {
        const response = await fetchWithAuth(`${API_URL}/orders/${id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch order');
        }
        return response.json();
    },

    async confirmOrder(id: string): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/orders/${id}/confirm`, {
            method: 'POST',
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to confirm order');
        }
    },

    async fulfillOrder(id: string): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/orders/${id}/fulfill`, {
            method: 'POST',
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to fulfill order');
        }
    }
};
