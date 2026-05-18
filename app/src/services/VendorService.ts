import type { Vendor, CreateVendorRequest } from '../types/vendor';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const VendorService = {
    async listVendors(): Promise<Vendor[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/vendors`);
        if (!response.ok) throw new Error('Failed to fetch vendors');
        return response.json();
    },

    async getVendor(id: string): Promise<Vendor> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/vendors/${id}`);
        if (!response.ok) throw new Error('Failed to fetch vendor');
        return response.json();
    },

    async createVendor(request: CreateVendorRequest): Promise<Vendor> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/vendors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        if (!response.ok) throw new Error('Failed to create vendor');
        return response.json();
    }
};
