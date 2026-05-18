import type {
    TaxResult,
    TaxPreviewRequest,
    TaxExemption,
    CreateExemptionRequest,
} from '../types/tax';
import { fetchWithAuth } from './fetchClient';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Preview tax calculation for a cart or invoice.
 * Does not commit the tax document — use for real-time UI display.
 */
export async function previewTax(request: TaxPreviewRequest): Promise<TaxResult> {
    const res = await fetchWithAuth(`${API_BASE}/api/v1/tax/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Tax preview failed' }));
        throw new Error(err.error || 'Tax preview failed');
    }
    return res.json();
}

/**
 * Get all tax exemptions for a customer.
 */
export async function getExemptions(customerID: string): Promise<TaxExemption[]> {
    const res = await fetchWithAuth(`${API_BASE}/api/v1/tax/exemptions/${customerID}`);
    if (!res.ok) {
        throw new Error('Failed to fetch tax exemptions');
    }
    return res.json();
}

/**
 * Create a new tax exemption certificate.
 */
export async function createExemption(data: CreateExemptionRequest): Promise<TaxExemption> {
    const res = await fetchWithAuth(`${API_BASE}/api/v1/tax/exemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to create exemption' }));
        throw new Error(err.error || 'Failed to create exemption');
    }
    return res.json();
}

/**
 * Delete a tax exemption certificate.
 */
export async function deleteExemption(id: string): Promise<void> {
    const res = await fetchWithAuth(`${API_BASE}/api/v1/tax/exemptions/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) {
        throw new Error('Failed to delete exemption');
    }
}
