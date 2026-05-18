import type { Product } from '../types/product';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const ProductService = {
    async getProducts(): Promise<Product[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/products`);
        if (!response.ok) {
            throw new Error('Failed to fetch products');
        }
        const payload = await response.json();
        // Backend returns a paged envelope: { data: Product[], total, limit, offset }.
        // Older endpoints returned a bare array; accept both shapes.
        return Array.isArray(payload) ? payload : (payload?.data ?? []);
    },

    async createProduct(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<Product> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(product),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create product');
        }

        return response.json();
    },
};
