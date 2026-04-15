import type {
    PortalLoginResponse,
    PortalUser,
    PortalConfig,
    PortalDashboard,
    PortalOrder,
    PortalInvoice,
    PortalDelivery,
    ReorderResponse,
    CatalogProduct,
    CatalogDetail,
    Cart,
    CheckoutRequest,
    CheckoutResponse,
    PortalInvite,
    InviteUserRequest,
    UpdateUserRoleRequest,
    UpdateUserStatusRequest,
} from '../types/portal';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Clear portal auth by calling the logout endpoint (clears httpOnly cookie)
 * and removing client-side user data.
 */
export async function clearToken(): Promise<void> {
    try {
        await fetch(`${API_URL}/api/portal/v1/logout`, {
            method: 'POST',
            credentials: 'include',
        });
    } catch {
        // Best-effort — continue with local cleanup even if logout call fails
    }
    localStorage.removeItem('portal_token'); // Clean up legacy storage if present
}

/**
 * Check if user is authenticated.
 * Since the JWT is in an httpOnly cookie (not accessible to JS), we check
 * for the portal_user object that is stored on login.
 */
export function isAuthenticated(): boolean {
    return localStorage.getItem('portal_user') !== null;
}

/**
 * Wrapper around shared fetchWithAuth that handles response parsing.
 * 401 handling is delegated to fetchWithAuth (centralized interceptor).
 */
async function portalFetch<T>(
    url: string,
    options: RequestInit = {},
): Promise<T> {
    const response = await fetchWithAuth(url, options);

    if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`API error: ${response.status} ${text}`);
    }

    return await response.json() as T;
}

export const PortalService = {
    /** Authenticate contractor and return JWT + user + config. */
    async login(email: string, password: string): Promise<PortalLoginResponse> {
        return portalFetch<PortalLoginResponse>(
            `${API_URL}/api/portal/v1/login`,
            { method: 'POST', body: JSON.stringify({ email, password }) },
        );
    },

    /** Get portal branding config (public). */
    async getConfig(): Promise<PortalConfig> {
        return portalFetch<PortalConfig>(`${API_URL}/api/portal/v1/config`);
    },

    /** Get contractor dashboard data. */
    async getDashboard(): Promise<PortalDashboard> {
        return portalFetch<PortalDashboard>(`${API_URL}/api/portal/v1/dashboard`);
    },

    /** List order history. */
    async getOrders(): Promise<PortalOrder[]> {
        return portalFetch<PortalOrder[]>(`${API_URL}/api/portal/v1/orders`);
    },

    /** Get single order with lines. */
    async getOrder(id: string): Promise<PortalOrder> {
        return portalFetch<PortalOrder>(`${API_URL}/api/portal/v1/orders/${id}`);
    },

    /** Create a reorder from historical order. */
    async reorder(orderId: string): Promise<ReorderResponse> {
        return portalFetch<ReorderResponse>(
            `${API_URL}/api/portal/v1/orders/reorder`,
            { method: 'POST', body: JSON.stringify({ order_id: orderId }) },
        );
    },

    /** List invoices. */
    async getInvoices(): Promise<PortalInvoice[]> {
        return portalFetch<PortalInvoice[]>(`${API_URL}/api/portal/v1/invoices`);
    },

    /** Get single invoice with lines. */
    async getInvoice(id: string): Promise<PortalInvoice> {
        return portalFetch<PortalInvoice>(`${API_URL}/api/portal/v1/invoices/${id}`);
    },

    /** List deliveries with POD info. */
    async getDeliveries(): Promise<PortalDelivery[]> {
        return portalFetch<PortalDelivery[]>(`${API_URL}/api/portal/v1/deliveries`);
    },

    /** Get single delivery with POD info. */
    async getDelivery(id: string): Promise<PortalDelivery> {
        return portalFetch<PortalDelivery>(`${API_URL}/api/portal/v1/deliveries/${id}`);
    },

    // --- Catalog Methods (Sprint 27) ---

    /** Browse product catalog with optional filters. */
    async getCatalog(params?: {
        q?: string;
        category?: string;
        species?: string;
        grade?: string;
    }): Promise<CatalogProduct[]> {
        const searchParams = new URLSearchParams();
        if (params?.q) searchParams.set('q', params.q);
        if (params?.category) searchParams.set('category', params.category);
        if (params?.species) searchParams.set('species', params.species);
        if (params?.grade) searchParams.set('grade', params.grade);
        const qs = searchParams.toString();
        return portalFetch<CatalogProduct[]>(
            `${API_URL}/api/portal/v1/catalog${qs ? `?${qs}` : ''}`,
        );
    },

    /** Get single catalog product detail. */
    async getCatalogProduct(id: string): Promise<CatalogDetail> {
        return portalFetch<CatalogDetail>(`${API_URL}/api/portal/v1/catalog/${id}`);
    },

    // --- Cart Methods (Sprint 27) ---

    /** Get current shopping cart. */
    async getCart(): Promise<Cart> {
        return portalFetch<Cart>(`${API_URL}/api/portal/v1/cart`);
    },

    /** Add item to cart. */
    async addToCart(productId: string, quantity: number): Promise<Cart> {
        return portalFetch<Cart>(
            `${API_URL}/api/portal/v1/cart/items`,
            { method: 'POST', body: JSON.stringify({ product_id: productId, quantity }) },
        );
    },

    /** Update cart item quantity. */
    async updateCartItem(itemId: string, quantity: number): Promise<Cart> {
        return portalFetch<Cart>(
            `${API_URL}/api/portal/v1/cart/items/${itemId}`,
            { method: 'PUT', body: JSON.stringify({ quantity }) },
        );
    },

    /** Remove item from cart. */
    async removeCartItem(itemId: string): Promise<Cart> {
        return portalFetch<Cart>(
            `${API_URL}/api/portal/v1/cart/items/${itemId}`,
            { method: 'DELETE' },
        );
    },

    /** Place order from cart. */
    async checkout(req: CheckoutRequest): Promise<CheckoutResponse> {
        return portalFetch<CheckoutResponse>(
            `${API_URL}/api/portal/v1/checkout`,
            { method: 'POST', body: JSON.stringify(req) },
        );
    },

    // --- User Management Methods (Sprint 34) ---

    /** Get portal users. */
    async getUsers(): Promise<PortalUser[]> {
        return portalFetch<PortalUser[]>(`${API_URL}/api/portal/v1/users`);
    },

    /** Get active invites. */
    async getInvites(): Promise<PortalInvite[]> {
        return portalFetch<PortalInvite[]>(`${API_URL}/api/portal/v1/invites`);
    },

    /** Invite a new user. */
    async inviteUser(req: InviteUserRequest): Promise<PortalInvite> {
        return portalFetch<PortalInvite>(
            `${API_URL}/api/portal/v1/invites`,
            { method: 'POST', body: JSON.stringify(req) },
        );
    },

    /** Update a user's role. */
    async updateUserRole(id: string, req: UpdateUserRoleRequest): Promise<void> {
        return portalFetch<void>(
            `${API_URL}/api/portal/v1/users/${id}/role`,
            { method: 'PUT', body: JSON.stringify(req) },
        );
    },

    /** Update a user's status. */
    async updateUserStatus(id: string, req: UpdateUserStatusRequest): Promise<void> {
        return portalFetch<void>(
            `${API_URL}/api/portal/v1/users/${id}/status`,
            { method: 'PUT', body: JSON.stringify(req) },
        );
    },
};
