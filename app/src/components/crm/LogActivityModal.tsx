import React, { useState } from 'react';
import type { CreateActivityRequest, Contact, ActivityType } from '../../types/crm';
import { crmApi } from '../../services/crmApi';
import { useToast } from '../ui/ToastContext';

interface LogActivityModalProps {
    customerId: string;
    contacts: Contact[];
    onClose: () => void;
    onSuccess: () => void;
}

export const LogActivityModal: React.FC<LogActivityModalProps> = ({
    customerId,
    contacts,
    onClose,
    onSuccess,
}) => {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<CreateActivityRequest>({
        activity_type: 'CALL',
        description: '',
        activity_date: new Date().toISOString().slice(0, 16), // YYYY-MM-DDThh:mm
        contact_id: '',
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            // Ensure date is valid ISO
            const payload = {
                ...formData,
                activity_date: new Date(formData.activity_date).toISOString(),
                contact_id: formData.contact_id === '' ? undefined : formData.contact_id,
            };
            await crmApi.createActivity(customerId, payload);
            onSuccess();
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to log activity', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h3 className="text-lg font-bold text-gray-900">Log Activity</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-4">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Activity Type</label>
                        <div className="grid grid-cols-4 gap-2">
                            {(['CALL', 'MEETING', 'EMAIL', 'NOTE'] as ActivityType[]).map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setFormData((prev) => ({ ...prev, activity_type: type }))}
                                    className={`px-3 py-2 text-sm font-medium rounded-md border ${formData.activity_type === type
                                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                        <input
                            type="datetime-local"
                            name="activity_date"
                            required
                            value={formData.activity_date}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact (Optional)</label>
                        <select
                            name="contact_id"
                            value={formData.contact_id || ''}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">-- No Specific Contact --</option>
                            {contacts.map(c => (
                                <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.role})</option>
                            ))}
                        </select>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description / Notes</label>
                        <textarea
                            name="description"
                            required
                            rows={4}
                            value={formData.description}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder={`Details about the ${formData.activity_type.toLowerCase()}...`}
                        ></textarea>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Log Activity'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
