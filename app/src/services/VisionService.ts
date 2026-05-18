import type { BlueprintScanResponse } from '../types/configurator';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const VisionService = {
    async scanBlueprint(
        blueprintText: string,
        configSelections: Record<string, string>
    ): Promise<BlueprintScanResponse> {
        const response = await fetchWithAuth(`${API_URL}/api/v1/vision/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                blueprint_text: blueprintText,
                config_selections: configSelections,
            }),
        });
        if (!response.ok) throw new Error('Blueprint scan failed');
        return response.json();
    },
};
