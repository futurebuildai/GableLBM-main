export interface PriceLevel {
    id: string;
    name: string;
    multiplier: number;
    created_at: string;
    updated_at: string;
}

export interface Customer {
    id: string;
    name: string;
    account_number: string;
    email?: string;
    phone?: string;
    address?: string;

    price_level_id?: string;
    price_level?: PriceLevel;

    salesperson_id?: string;
    salesperson_name?: string;

    credit_limit: number;
    balance_due: number;
    is_active: boolean;

    created_at: string;
    updated_at: string;
}

export interface CustomerJob {
    id: string;
    customer_id: string;
    name: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}
