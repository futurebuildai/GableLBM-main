import type { MillworkOption, CreateOptionRequest } from '../types/millwork';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const MillworkService = {
    async getOptionsByCategory(category: string): Promise<MillworkOption[]> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/millwork/options?category=${category}`);
        if (!response.ok) {
            throw new Error('Failed to fetch millwork options');
        }
        return response.json();
    },

    async createOption(option: CreateOptionRequest): Promise<MillworkOption> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/millwork/options`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(option),
        });
        if (!response.ok) {
            throw new Error('Failed to create millwork option');
        }
        return response.json();
    },

    calculateDoorPrice(config: import('../types/millwork').MillworkConfiguration): number {
        const BASE_PRICE = 250.00;
        const STANDARD_WIDTH = 36;
        const STANDARD_HEIGHT = 80;
        const PRICE_PER_SQFT_OVERAGE = 15.00;

        let price = BASE_PRICE;
        if (config.doorType) price += config.doorType.price_adjustment;
        if (config.material) price += config.material.price_adjustment;
        if (config.glass) price += config.glass.price_adjustment;

        // Simple dimension logic: +$15 for every sq ft over standard 36x80
        const area = (config.width * config.height) / 144; // sq ft
        const standardArea = (STANDARD_WIDTH * STANDARD_HEIGHT) / 144;

        if (area > standardArea) {
            price += (area - standardArea) * PRICE_PER_SQFT_OVERAGE;
        }

        return price;
    }
};
