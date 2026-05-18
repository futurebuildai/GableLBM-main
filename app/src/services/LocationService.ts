import type {
    BranchSummary,
    Location,
    UserLocation,
} from '../types/location';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

interface BranchPayload {
    code: string;
    name: string;
    description?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    timezone?: string;
    tax_jurisdiction_code?: string;
    default_tax_rate?: number;
    active?: boolean;
}

export const LocationService = {
    // -------- Locations (physical sub-locations under a branch) ----------

    async listLocations(): Promise<Location[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/locations`);
        if (!response.ok) {
            throw new Error('Failed to fetch locations');
        }
        return response.json();
    },

    async createLocation(data: Omit<Location, 'id' | 'created_at' | 'updated_at'>): Promise<Location> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/locations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error('Failed to create location');
        }
        return response.json();
    },

    async updateLocation(id: string, data: Partial<Location>): Promise<Location> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/locations/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error('Failed to update location');
        }
        return response.json();
    },

    async deleteLocation(id: string): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/locations/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            throw new Error('Failed to delete location');
        }
    },

    // -------- Branches (top-level locations: type='BRANCH') --------------

    async listBranches(includeInactive = false): Promise<Location[]> {
        const qs = includeInactive ? '?include_inactive=true' : '';
        const response = await fetchWithAuth(`${API_URL}/api/v1/branches${qs}`);
        if (!response.ok) {
            throw new Error('Failed to fetch branches');
        }
        return response.json();
    },

    async getBranch(id: string): Promise<Location> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/branches/${id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch branch');
        }
        return response.json();
    },

    async createBranch(data: BranchPayload): Promise<Location> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/branches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error('Failed to create branch');
        }
        return response.json();
    },

    async updateBranch(id: string, data: Partial<BranchPayload>): Promise<Location> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/branches/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error('Failed to update branch');
        }
        return response.json();
    },

    async archiveBranch(id: string): Promise<void> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/branches/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            throw new Error('Failed to archive branch');
        }
    },

    async getBranchTree(id: string): Promise<Location[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/branches/${id}/tree`);
        if (!response.ok) {
            throw new Error('Failed to fetch branch tree');
        }
        return response.json();
    },

    // -------- User <-> branch grants -------------------------------------

    /**
     * Returns the active branches granted to the current JWT subject. Used
     * to populate the global branch switcher.
     */
    async getMyBranches(): Promise<BranchSummary[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/me/branches`);
        if (!response.ok) {
            throw new Error('Failed to fetch user branches');
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    },

    async listUserBranches(userSub: string): Promise<BranchSummary[]> {
        const response = await fetchWithAuth(
            `${API_URL}/api/v1/users/${encodeURIComponent(userSub)}/branches`,
        );
        if (!response.ok) {
            throw new Error('Failed to fetch user branches');
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    },

    async grantUserBranch(
        userSub: string,
        branchId: string,
        isHome = false,
    ): Promise<UserLocation> {
        const response = await fetchWithAuth(
            `${API_URL}/api/v1/users/${encodeURIComponent(userSub)}/branches`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branch_id: branchId, is_home: isHome }),
            },
        );
        if (!response.ok) {
            throw new Error('Failed to grant user branch');
        }
        return response.json();
    },

    async revokeUserBranch(userSub: string, branchId: string): Promise<void> {
        const response = await fetchWithAuth(
            `${API_URL}/api/v1/users/${encodeURIComponent(userSub)}/branches/${branchId}`,
            { method: 'DELETE' },
        );
        if (!response.ok) {
            throw new Error('Failed to revoke user branch');
        }
    },

    async listKnownUsers(): Promise<string[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/users`);
        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    },

    async listBranchUsers(branchId: string): Promise<UserLocation[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/branches/${branchId}/users`);
        if (!response.ok) {
            throw new Error('Failed to fetch branch users');
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    },

    async setHomeBranch(userSub: string, branchId: string): Promise<void> {
        const response = await fetchWithAuth(
            `${API_URL}/api/v1/users/${encodeURIComponent(userSub)}/home-branch`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branch_id: branchId }),
            },
        );
        if (!response.ok) {
            throw new Error('Failed to set home branch');
        }
    },
};
