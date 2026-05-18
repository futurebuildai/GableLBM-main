import type { ParseResponse } from '../types/parsing';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const ParsingService = {
    /**
     * Upload a material list image for AI parsing.
     * Returns parsed items matched against the product catalog.
     */
    async uploadMaterialList(file: File): Promise<ParseResponse> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetchWithAuth(`${API_URL}/api/v1/parsing/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to parse material list');
        }

        return response.json();
    },
};
