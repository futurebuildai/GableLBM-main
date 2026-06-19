import type { ParseResponse } from '../types/parsing';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

// AI vision OCR of a material list can take 10–60s — beyond the default 10s timeout.
const AI_PARSE_TIMEOUT = 120_000;

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
            timeout: AI_PARSE_TIMEOUT,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to parse material list');
        }

        return response.json();
    },
};
