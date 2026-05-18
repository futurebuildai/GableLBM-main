import type { RebateProgram, RebateTier, RebateClaim, CalculateClaimRequest } from '../types/rebate';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const RebateService = {
    createProgram: async (program: RebateProgram, tiers: RebateTier[]): Promise<RebateProgram> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pricing/rebates/programs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ program, tiers }),
        });
        if (!response.ok) {
            throw new Error('Failed to create rebate program');
        }
        return response.json() as Promise<RebateProgram>;
    },

    listPrograms: async (vendorId?: string): Promise<RebateProgram[]> => {
        let url = `${API_URL}/api/v1/pricing/rebates/programs`;
        if (vendorId) {
            url += `?vendor_id=${encodeURIComponent(vendorId)}`;
        }
        const response = await fetchWithAuth(url);
        if (!response.ok) {
            throw new Error('Failed to fetch rebate programs');
        }
        return response.json() as Promise<RebateProgram[]>;
    },

    getProgram: async (id: string): Promise<RebateProgram> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pricing/rebates/programs/${id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch rebate program');
        }
        return response.json() as Promise<RebateProgram>;
    },

    calculateClaim: async (programId: string, request: CalculateClaimRequest): Promise<RebateClaim> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pricing/rebates/programs/${programId}/claims/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            throw new Error('Failed to calculate rebate claim');
        }
        return response.json() as Promise<RebateClaim>;
    },

    listClaims: async (programId: string): Promise<RebateClaim[]> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pricing/rebates/programs/${programId}/claims`);
        if (!response.ok) {
            throw new Error('Failed to fetch rebate claims');
        }
        return response.json() as Promise<RebateClaim[]>;
    }
};
