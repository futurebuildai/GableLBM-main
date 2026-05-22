import type {
    POSTransaction,
    QuickSearchResult,
    AddLineItemRequest,
    AddTenderRequest,
    TransactionSummary
} from '../types/pos';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const posService = {
    startTransaction: async (registerID: string, cashierID: string, customerID?: string): Promise<POSTransaction> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pos/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                register_id: registerID,
                cashier_id: cashierID,
                customer_id: customerID || undefined,
            }),
        });
        if (!response.ok) throw new Error('Failed to start transaction');
        return response.json();
    },

    getTransaction: async (id: string): Promise<POSTransaction> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pos/transactions/${id}`);
        if (!response.ok) throw new Error('Failed to get transaction');
        return response.json();
    },

    addItem: async (txId: string, item: AddLineItemRequest): Promise<POSTransaction> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pos/transactions/${txId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
        });
        if (!response.ok) throw new Error('Failed to add item');
        return response.json();
    },

    updateItemQuantity: async (txId: string, itemId: string, quantity: number): Promise<POSTransaction> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pos/transactions/${txId}/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity }),
        });
        if (!response.ok) throw new Error('Failed to update item quantity');
        return response.json();
    },

    removeItem: async (txId: string, itemId: string): Promise<POSTransaction> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pos/transactions/${txId}/items/${itemId}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to remove item');
        return response.json();
    },

    completeTransaction: async (txId: string, tenders: AddTenderRequest[]): Promise<POSTransaction> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pos/transactions/${txId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenders }),
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(err || 'Failed to complete transaction');
        }
        return response.json();
    },

    voidTransaction: async (txId: string): Promise<POSTransaction> => {
        const response = await fetchWithAuth(`${API_URL}/api/v1/pos/transactions/${txId}/void`, {
            method: 'POST',
        });
        if (!response.ok) throw new Error('Failed to void transaction');
        return response.json();
    },

    listTransactions: async (registerID?: string, date?: string): Promise<TransactionSummary[]> => {
        const params = new URLSearchParams();
        if (registerID) params.append('register_id', registerID);
        if (date) params.append('date', date);
        const response = await fetchWithAuth(`${API_URL}/api/v1/pos/transactions?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to list transactions');
        return response.json();
    },

    searchProducts: async (query: string): Promise<QuickSearchResult[]> => {
        if (query.length < 2) return [];
        const response = await fetchWithAuth(`${API_URL}/api/v1/pos/products/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Failed to search products');
        return response.json();
    },

    searchCustomers: async (query: string): Promise<Array<{ id: string; name: string; account_number: string }>> => {
        if (query.length < 2) return [];
        const response = await fetchWithAuth(`${API_URL}/api/v1/customers?limit=10&offset=0`);
        if (!response.ok) throw new Error('Failed to search customers');
        const payload = await response.json();
        const customers = Array.isArray(payload) ? payload : (payload?.data ?? []);
        // Client-side filter since the endpoint doesn't have a search param
        const q = query.toLowerCase();
        return customers.filter((c: { name: string; account_number: string }) =>
            c.name.toLowerCase().includes(q) || c.account_number.toLowerCase().includes(q)
        );
    },
};

