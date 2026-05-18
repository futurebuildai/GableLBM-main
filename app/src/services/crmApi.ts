import type {
    Contact,
    Activity,
    CreateContactRequest,
    CreateActivityRequest,
} from '../types/crm';
import { fetchWithAuth } from './fetchClient';

const API_BASE = import.meta.env.VITE_API_URL || '';

export const crmApi = {
    // Contacts
    listContacts: async (customerId: string): Promise<Contact[]> => {
        const res = await fetchWithAuth(`${API_BASE}/api/v1/customers/${customerId}/contacts`);
        if (!res.ok) throw new Error('Failed to fetch contacts');
        return res.json();
    },

    createContact: async (customerId: string, data: CreateContactRequest): Promise<Contact> => {
        const res = await fetchWithAuth(`${API_BASE}/api/v1/customers/${customerId}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create contact');
        return res.json();
    },

    updateContact: async (contactId: string, data: Partial<Contact>): Promise<Contact> => {
        const res = await fetchWithAuth(`${API_BASE}/api/v1/contacts/${contactId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update contact');
        return res.json();
    },

    deleteContact: async (contactId: string): Promise<void> => {
        const res = await fetchWithAuth(`${API_BASE}/api/v1/contacts/${contactId}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete contact');
    },

    // Activities
    listActivities: async (customerId: string): Promise<Activity[]> => {
        const res = await fetchWithAuth(`${API_BASE}/api/v1/customers/${customerId}/activities`);
        if (!res.ok) throw new Error('Failed to fetch activities');
        return res.json();
    },

    createActivity: async (customerId: string, data: CreateActivityRequest): Promise<Activity> => {
        const res = await fetchWithAuth(`${API_BASE}/api/v1/customers/${customerId}/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create activity');
        return res.json();
    },
};
