import { useState, useEffect, useCallback } from 'react';
import { reportingApi } from '../../services/reportingApi';
import type { SavedReport } from '../../services/reportingApi';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/ui/ToastContext';

export default function SavedReports() {
    const { showToast } = useToast();
    const [reports, setReports] = useState<SavedReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadReports = useCallback(async () => {
        try {
            setLoading(true);
            const data = await reportingApi.listSavedReports();
            setReports(data || []);
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load saved reports');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        loadReports();
    }, [loadReports]);

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this report?')) return;
        try {
            await reportingApi.deleteSavedReport(id);
            loadReports();
        } catch (err: unknown) {
            showToast('Failed to delete report: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
        }
    };

    if (loading) return <div className="p-8">Loading reports...</div>;

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Saved Reports</h1>
                <Link
                    to="/reports/builder"
                    className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
                >
                    Create New Report
                </Link>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded mb-6">
                    {error}
                </div>
            )}

            {reports.length === 0 ? (
                <div className="text-center text-gray-500 py-12 bg-white rounded shadow">
                    <p>No reports saved yet.</p>
                    <Link to="/reports/builder" className="text-blue-600 hover:underline mt-2 inline-block">
                        Build your first report
                    </Link>
                </div>
            ) : (
                <div className="bg-white shadow rounded overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {reports.map((report) => (
                                <tr key={report.id}>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{report.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{report.entity_type}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">{report.description}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            className="text-indigo-600 hover:text-indigo-900 mr-4"
                                            onClick={() => showToast('Run functionality coming soon', 'info')}
                                        >
                                            Run
                                        </button>
                                        <Link to={`/reports/builder?id=${report.id}`} className="text-blue-600 hover:text-blue-900 mr-4">
                                            Edit
                                        </Link>
                                        <button
                                            onClick={() => handleDelete(report.id)}
                                            className="text-red-600 hover:text-red-900"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
