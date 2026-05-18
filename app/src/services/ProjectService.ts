import type {
    Project,
    ProjectDashboardDTO,
    CreateProjectRequest,
    UpdateProjectRequest
} from '../types/project';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Wrapper around shared fetchWithAuth that handles response parsing.
 * 401 handling is delegated to fetchWithAuth (centralized interceptor).
 */
async function authedFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetchWithAuth(url, options);

    if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`API error: ${response.status} ${text}`);
    }

    return await response.json() as T;
}

export const ProjectService = {
    async listProjects(): Promise<Project[]> {
        return authedFetch<Project[]>(`${API_URL}/api/portal/v1/projects`);
    },

    async getProjectDashboard(id: string): Promise<ProjectDashboardDTO> {
        return authedFetch<ProjectDashboardDTO>(`${API_URL}/api/portal/v1/projects/${id}`);
    },

    async createProject(req: CreateProjectRequest): Promise<Project> {
        return authedFetch<Project>(`${API_URL}/api/portal/v1/projects`, {
            method: 'POST',
            body: JSON.stringify(req),
        });
    },

    async updateProject(id: string, req: UpdateProjectRequest): Promise<Project> {
        return authedFetch<Project>(`${API_URL}/api/portal/v1/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(req),
        });
    },
};
