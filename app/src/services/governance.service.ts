import type { RFC, CreateRFCInput, UpdateRFCInput } from '../types/governance';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const GovernanceService = {
    async listRFCs(): Promise<RFC[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/governance/rfcs`);
        if (!response.ok) {
            throw new Error('Failed to list RFCs');
        }
        return response.json();
    },

    async getRFC(id: string): Promise<RFC> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/governance/rfcs/${id}`);
        if (!response.ok) {
            throw new Error('Failed to get RFC');
        }
        return response.json();
    },

    async createRFC(input: CreateRFCInput): Promise<RFC> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/governance/rfcs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create RFC');
        }

        return response.json();
    },

    async updateRFC(id: string, input: UpdateRFCInput): Promise<RFC> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/governance/rfcs/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to update RFC');
        }

        return response.json();
    },
};
