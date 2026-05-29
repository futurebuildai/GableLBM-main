import { fetchWithAuth } from './fetchClient';

const API_BASE = import.meta.env.VITE_API_URL || '';

export interface ReportDefinition {
  columns: ReportColumn[];
  filters: ReportFilter[];
  groupings: ReportGrouping[];
}

export interface ReportColumn {
  field: string;
  label: string;
  aggregation?: string;
}

export interface ReportFilter {
  field: string;
  operator: string;
  value: string | number | boolean | null;
}

export interface ReportGrouping {
  field: string;
}

export interface SavedReport {
  id: string;
  name: string;
  description: string;
  entity_type: string;
  definition_json: ReportDefinition;
  created_at: string;
}

export interface ReportSchedule {
  id: string;
  report_id: string;
  cron_expression: string;
  recipients: string[];
  status: string;
  format: 'CSV' | 'XLSX' | 'PDF';
  last_run_at?: string;
  next_run_at?: string;
}

export const reportingApi = {
  // Ad-hoc query preview
  previewReport: async (entityType: string, definition: ReportDefinition) => {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/reporting/builder/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, definition })
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  },

  // Export
  exportReport: async (entityType: string, format: 'csv' | 'xlsx' | 'pdf', definition: ReportDefinition) => {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/reporting/builder/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, format, definition })
    });
    if (!response.ok) throw new Error(`Export failed`);
    return response.blob();
  },

  // Saved Reports CRUD
  listSavedReports: async (): Promise<SavedReport[]> => {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/reporting/saved`);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  },

  getSavedReport: async (id: string): Promise<SavedReport> => {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/reporting/saved/${id}`);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  },

  saveReport: async (report: Partial<SavedReport>): Promise<SavedReport> => {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/reporting/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  },

  updateSavedReport: async (id: string, report: Partial<SavedReport>) => {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/reporting/saved/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  },

  deleteSavedReport: async (id: string) => {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/reporting/saved/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(`Delete failed`);
  },

  // Run a saved report
  runSavedReport: async (id: string): Promise<Record<string, unknown>[]> => {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/reporting/saved/${id}/run`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  },

  // Schedules CRUD
  listReportSchedules: async (): Promise<ReportSchedule[]> => {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/reporting/schedules`);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  },

  createReportSchedule: async (schedule: Partial<ReportSchedule>): Promise<ReportSchedule> => {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/reporting/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schedule)
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  },

  deleteReportSchedule: async (id: string): Promise<void> => {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/reporting/schedules/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(`Delete failed`);
  }
};
