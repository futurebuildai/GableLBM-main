import type { SalesPerson } from '../types/salesteam';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const SalesTeamService = {
    async listSalesTeam(): Promise<SalesPerson[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/sales-team`);
        if (!response.ok) {
            throw new Error('Failed to fetch sales team');
        }
        return response.json();
    },

    async getSalesPerson(id: string): Promise<SalesPerson> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/sales-team/${id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch salesperson');
        }
        return response.json();
    },
};
