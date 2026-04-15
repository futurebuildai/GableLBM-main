import React, { useState } from 'react';
import { reportingApi } from '../../services/reportingApi';
import type { ReportDefinition, ReportColumn, ReportFilter, ReportGrouping } from '../../services/reportingApi';
import { useToast } from '../../components/ui/ToastContext';

// Simplified Schema Metadata for the UI (mirrors backend entitySchemas)
const SCHEMA_METADATA: Record<string, { label: string; fields: { name: string; type: string }[] }> = {
  invoices: {
    label: 'Invoices',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'invoice_number', type: 'string' },
      { name: 'status', type: 'string' },
      { name: 'total_amount', type: 'number' },
      { name: 'created_at', type: 'date' },
      { name: 'customer_name', type: 'string' },
    ],
  },
  orders: {
    label: 'Orders',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'order_number', type: 'string' },
      { name: 'status', type: 'string' },
      { name: 'total_amount', type: 'number' },
      { name: 'created_at', type: 'date' },
      { name: 'customer_name', type: 'string' },
    ],
  },
  inventory: {
    label: 'Inventory',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'product_name', type: 'string' },
      { name: 'quantity', type: 'number' },
    ],
  },
};

export default function ReportBuilder() {
  const { showToast } = useToast();
  const [entityType, setEntityType] = useState('invoices');
  const [reportName, setReportName] = useState('New Custom Report');

  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [groupings, setGroupings] = useState<ReportGrouping[]>([]);

  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableFields = SCHEMA_METADATA[entityType]?.fields || [];

  const handleAddColumn = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const field = e.target.value;
    if (!field) return;
    if (!columns.some(c => c.field === field)) {
      setColumns([...columns, { field, label: field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }]);
    }
    e.target.value = ''; // Reset select
  };

  const handleRemoveColumn = (field: string) => {
    setColumns(columns.filter(c => c.field !== field));
  };

  const handleUpdateColumnAgg = (field: string, agg: string) => {
    setColumns(columns.map(c => c.field === field ? { ...c, aggregation: agg } : c));
  };

  const handleAddFilter = () => {
    if (availableFields.length > 0) {
      setFilters([...filters, { field: availableFields[0].name, operator: '=', value: '' }]);
    }
  };

  const handleUpdateFilter = (index: number, key: keyof ReportFilter, value: string | number | boolean | null) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], [key]: value };
    setFilters(newFilters);
  };

  const handleRemoveFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const handleAddGrouping = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const field = e.target.value;
    if (!field) return;
    if (!groupings.some(g => g.field === field)) {
      setGroupings([...groupings, { field }]);
    }
    e.target.value = '';
  };

  const handleRemoveGrouping = (field: string) => {
    setGroupings(groupings.filter(g => g.field !== field));
  };

  const buildDefinition = (): ReportDefinition => ({
    columns,
    filters,
    groupings,
  });

  const handlePreview = async () => {
    if (columns.length === 0) {
      setError('Please select at least one column.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await reportingApi.previewReport(entityType, buildDefinition());
      setPreviewData(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (columns.length === 0) return;

    setLoading(true);
    try {
      const blob = await reportingApi.exportReport(entityType, format, buildDefinition());
      // Create download link
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${reportName.replace(/\s+/g, '_')}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError('Export failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (columns.length === 0) {
      showToast('Cannot save report without columns', 'error');
      return;
    }
    try {
      await reportingApi.saveReport({
        name: reportName,
        description: 'Auto-saved via builder',
        entity_type: entityType,
        definition_json: buildDefinition()
      });
      showToast('Report saved successfully', 'success');
    } catch (err: unknown) {
      showToast('Failed to save report: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <input
          type="text"
          value={reportName}
          onChange={(e) => setReportName(e.target.value)}
          className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1"
        />
        <div className="space-x-2">
          <button onClick={handleSave} className="bg-white border border-gray-300 px-4 py-2 rounded shadow-sm hover:bg-gray-50">Save</button>
          <button onClick={() => handleExport('csv')} className="bg-white border border-gray-300 px-4 py-2 rounded shadow-sm hover:bg-gray-50">Export CSV</button>
          <button onClick={() => handleExport('xlsx')} className="bg-white border border-gray-300 px-4 py-2 rounded shadow-sm hover:bg-gray-50">Export XLSX</button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar: Controls */}
        <div className="col-span-4 space-y-6">

          {/* Base Entity Selection */}
          <div className="bg-white p-4 rounded shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Settings</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base Data Source</label>
            <select
              className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setColumns([]);
                setFilters([]);
                setGroupings([]);
                setPreviewData(null);
              }}
            >
              {Object.entries(SCHEMA_METADATA).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </div>

          {/* Columns */}
          <div className="bg-white p-4 rounded shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Columns</h3>
              <select onChange={handleAddColumn} className="text-sm border-gray-300 rounded" defaultValue="">
                <option value="" disabled>+ Add Column</option>
                {availableFields.map(f => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
              </select>
            </div>
            {columns.length === 0 && <p className="text-xs text-gray-500 italic">No columns selected.</p>}
            <ul className="space-y-2">
              {columns.map((col) => (
                <li key={col.field} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded border border-gray-100">
                  <span className="font-medium text-gray-800">{col.label}</span>
                  <div className="flex items-center space-x-2">
                    <select
                      className="text-xs py-1 border-gray-300 rounded"
                      value={col.aggregation || ''}
                      onChange={(e) => handleUpdateColumnAgg(col.field, e.target.value)}
                    >
                      <option value="">No Aggregation</option>
                      <option value="SUM">Sum</option>
                      <option value="COUNT">Count</option>
                      <option value="AVG">Average</option>
                    </select>
                    <button onClick={() => handleRemoveColumn(col.field)} className="text-red-500 hover:text-red-700">&times;</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Filters */}
          <div className="bg-white p-4 rounded shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Filters</h3>
              <button onClick={handleAddFilter} className="text-sm text-blue-600 hover:text-blue-800 font-medium">+ Add Filter</button>
            </div>
            {filters.length === 0 && <p className="text-xs text-gray-500 italic">No filters applied.</p>}
            <div className="space-y-3">
              {filters.map((filter, idx) => (
                <div key={idx} className="flex flex-col space-y-2 bg-gray-50 p-2 rounded border border-gray-100 relative">
                  <button onClick={() => handleRemoveFilter(idx)} className="absolute top-1 right-2 text-red-500 hover:text-red-700 text-lg">&times;</button>
                  <select
                    value={filter.field}
                    onChange={(e) => handleUpdateFilter(idx, 'field', e.target.value)}
                    className="text-sm border-gray-300 rounded w-full pr-6"
                  >
                    {availableFields.map(f => (<option key={f.name} value={f.name}>{f.name}</option>))}
                  </select>
                  <div className="flex space-x-2">
                    <select
                      value={filter.operator}
                      onChange={(e) => handleUpdateFilter(idx, 'operator', e.target.value)}
                      className="text-sm border-gray-300 rounded w-1/3"
                    >
                      <option value="=">=</option>
                      <option value="!=">!=</option>
                      <option value=">">&gt;</option>
                      <option value="<">&lt;</option>
                      <option value="LIKE">Contains</option>
                    </select>
                    <input
                      type="text"
                      value={filter.value != null ? String(filter.value) : ''}
                      onChange={(e) => handleUpdateFilter(idx, 'value', e.target.value)}
                      placeholder="Value..."
                      className="text-sm border-gray-300 rounded w-2/3"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Groupings */}
          <div className="bg-white p-4 rounded shadow-sm border-l-4 border-indigo-400">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Group By</h3>
              <select onChange={handleAddGrouping} className="text-sm border-gray-300 rounded" defaultValue="">
                <option value="" disabled>+ Add Grouping</option>
                {availableFields.map(f => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
              </select>
            </div>
            {groupings.length === 0 && <p className="text-xs text-gray-500 italic">No groupings applied.</p>}
            <div className="flex flex-wrap gap-2">
              {groupings.map(g => (
                <span key={g.field} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  {SCHEMA_METADATA[entityType]?.fields.find(f => f.name === g.field)?.name || g.field}
                  <button type="button" onClick={() => handleRemoveGrouping(g.field)} className="flex-shrink-0 ml-1.5 h-4 w-4 rounded-full inline-flex items-center justify-center text-indigo-400 hover:bg-indigo-200 hover:text-indigo-500 focus:outline-none focus:bg-indigo-500 focus:text-white">
                    <span className="sr-only">Remove grouping</span>
                    <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                      <path strokeLinecap="round" strokeWidth="1.5" d="M1 1l6 6m0-6L1 7" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            {groupings.length > 0 && <p className="text-xs text-indigo-600 mt-2">Note: Ensure un-grouped columns use an aggregation like SUM or COUNT.</p>}
          </div>

        </div>

        {/* Right Content Area: Preview */}
        <div className="col-span-8">
          <div className="bg-white rounded shadow-sm border border-gray-200 h-full flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-medium text-gray-800">Data Preview</h2>
              <button
                onClick={handlePreview}
                disabled={loading || columns.length === 0}
                className={`px-4 py-2 rounded text-white font-medium ${loading || columns.length === 0 ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}`}
              >
                {loading ? 'Running...' : 'Run Report'}
              </button>
            </div>

            <div className="flex-1 p-4 overflow-auto">
              {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded mb-4">
                  {error}
                </div>
              )}

              {!previewData ? (
                <div className="h-full flex items-center justify-center text-gray-400">
                  <p>Select columns and click Run Report to preview data (Limit 50 rows).</p>
                </div>
              ) : previewData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500">
                  No records found matching criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {columns.map((col, i) => (
                          <th key={i} className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                            {col.label} {col.aggregation ? `(${col.aggregation})` : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {previewData.slice(0, 50).map((row, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-gray-50">
                          {columns.map((col, colIdx) => (
                            <td key={colIdx} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {row[col.field] !== null ? String(row[col.field]) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewData.length >= 50 && (
                    <div className="mt-4 text-center text-sm text-gray-500 italic">
                      Preview limited to 50 rows. Export to see full results.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
