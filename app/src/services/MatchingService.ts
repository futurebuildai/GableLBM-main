import type { MatchResult, MatchException, MatchConfig, UpdateMatchConfigRequest } from '../types/matching';
import { fetchWithAuth } from './fetchClient';

const API = import.meta.env.VITE_API_URL || '';

export async function runMatch(poId: string): Promise<MatchResult> {
    const res = await fetchWithAuth(`${API}/api/v1/matching/run/${poId}`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function getMatchResult(poId: string): Promise<MatchResult> {
    const res = await fetchWithAuth(`${API}/api/v1/matching/results/${poId}`);
    if (!res.ok) throw new Error('Failed to fetch match result');
    return res.json();
}

export async function listExceptions(): Promise<MatchException[]> {
    const res = await fetchWithAuth(`${API}/api/v1/matching/exceptions`);
    if (!res.ok) throw new Error('Failed to fetch exceptions');
    return res.json();
}

export async function getMatchConfig(): Promise<MatchConfig> {
    const res = await fetchWithAuth(`${API}/api/v1/matching/config`);
    if (!res.ok) throw new Error('Failed to fetch match config');
    return res.json();
}

export async function updateMatchConfig(data: UpdateMatchConfigRequest): Promise<MatchConfig> {
    const res = await fetchWithAuth(`${API}/api/v1/matching/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
