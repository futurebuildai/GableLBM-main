import type { Location } from '../types/location';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || ''; // TODO: use environment variable

export const LocationService = {
    async listLocations(): Promise<Location[]> {
        const response = await fetchWithAuth(`${API_URL}/locations`);
        if (!response.ok) {
            throw new Error('Failed to fetch locations');
        }
        return response.json();
    },

    async createLocation(data: Omit<Location, 'id' | 'created_at' | 'updated_at'>): Promise<Location> {
        const response = await fetchWithAuth(`${API_URL}/locations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error('Failed to create location');
        }
        return response.json();
    }
};
