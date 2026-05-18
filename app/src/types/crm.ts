// CRM domain types

export type ContactRole = 'Buyer' | 'AP' | 'Owner' | 'Site Super';

export type ActivityType = 'CALL' | 'MEETING' | 'EMAIL' | 'NOTE';

export interface Contact {
    id: string;
    customer_id: string;
    first_name: string;
    last_name: string;
    title?: string;
    email?: string;
    phone?: string;
    role: ContactRole;
    is_primary: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface Activity {
    id: string;
    customer_id: string;
    contact_id?: string;
    activity_type: ActivityType;
    description: string;
    logged_by?: string;
    activity_date: string; // ISO 8601
    created_at: string;
    updated_at: string;
}

export interface CreateContactRequest {
    first_name: string;
    last_name: string;
    title?: string;
    email?: string;
    phone?: string;
    role: ContactRole;
    is_primary: boolean;
    is_active?: boolean;
}

export interface CreateActivityRequest {
    contact_id?: string;
    activity_type: ActivityType;
    description: string;
    activity_date: string;
}
