export type LocationType = 'BRANCH' | 'ZONE' | 'AISLE' | 'RACK' | 'SHELF' | 'BIN' | 'YARD';

export interface Location {
    id: string;
    parent_id?: string;
    branch_id?: string;
    path: string;
    type: LocationType;
    code: string;
    description?: string;
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    tax_jurisdiction_code?: string;
    default_tax_rate?: number;
    timezone?: string;
    active?: boolean;
    created_at: string;
    updated_at: string;
    children?: Location[];
}

export interface CreateLocationRequest {
    parent_id?: string;
    type: LocationType;
    code: string;
    description?: string;
    name?: string;
}

/**
 * BranchSummary mirrors the backend BranchSummary returned by
 * `GET /api/v1/me/branches` and `GET /api/v1/users/{sub}/branches`.
 */
export interface BranchSummary {
    id: string;
    code: string;
    name: string;
    active: boolean;
    is_home: boolean;
    timezone?: string;
}

export interface UserLocation {
    user_sub: string;
    branch_id: string;
    is_home: boolean;
    granted_at: string;
    granted_by?: string;
}
