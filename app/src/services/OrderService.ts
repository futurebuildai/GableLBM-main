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
            // Price-protection pre-ship gate: backend returns 409 with a
            // structured payload (code "UNRESOLVED_EXPOSURE") so the UI can
            // open the block modal. Detach a typed error that carries the
            // payload through to the caller.
            if (response.status === 409) {
                try {
                    const body = await response.json();
                    if (body?.code === 'UNRESOLVED_EXPOSURE') {
                        const err = new Error(body.error || 'Unresolved exposure') as Error & { unresolvedExposure?: unknown };
                        err.unresolvedExposure = body;
                        throw err;
                    }
                    throw new Error(body?.error || 'Conflict');
                } catch (parseOrThrow) {
                    if (parseOrThrow instanceof Error) throw parseOrThrow;
                    throw new Error('Conflict');
                }
            }
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
