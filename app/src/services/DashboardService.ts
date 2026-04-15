import type {
    DashboardSummary,
    InventoryAlert,
    TopCustomer,
    OrderActivity,
    RevenueTrendPoint,
} from '../types/dashboard';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const DashboardService = {
    /**
     * Fetches aggregate KPIs for the executive dashboard.
     */
    async getSummary(): Promise<DashboardSummary> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/dashboard/summary`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<DashboardSummary>;
    },

    /**
     * Fetches products with low or zero stock.
     */
    async getInventoryAlerts(): Promise<InventoryAlert[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/dashboard/inventory-alerts`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<InventoryAlert[]>;
    },

    /**
     * Fetches top customers by revenue.
     */
    async getTopCustomers(): Promise<TopCustomer[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/dashboard/top-customers`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<TopCustomer[]>;
    },

    /**
     * Fetches recent orders and status distribution.
     */
    async getOrderActivity(): Promise<OrderActivity> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/dashboard/order-activity`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<OrderActivity>;
    },

    /**
     * Fetches 7-day revenue trend for chart.
     */
    async getRevenueTrend(): Promise<RevenueTrendPoint[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/dashboard/revenue-trend`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<RevenueTrendPoint[]>;
    },
};
