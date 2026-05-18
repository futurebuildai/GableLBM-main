import type { AccountSummary, CustomerTransaction } from '../types/account';
import { fetchWithAuth } from './fetchClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const AccountService = {
    getAccountSummary: async (customerId: string): Promise<AccountSummary> => {
        const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/accounts/${customerId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch account summary');
        }
        return response.json();
    },

    getTransactions: async (customerId: string): Promise<CustomerTransaction[]> => {
        const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/accounts/${customerId}/transactions`);
        if (!response.ok) {
            throw new Error('Failed to fetch transactions');
        }
        return response.json();
    },
};
