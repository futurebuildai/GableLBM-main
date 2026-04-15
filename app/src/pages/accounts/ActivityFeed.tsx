import React, { useState, useEffect } from 'react';
import type { Activity, Contact } from '../../types/crm';
import { crmApi } from '../../services/crmApi';
import { LogActivityModal } from '../../components/crm/LogActivityModal';
import { format } from 'date-fns';
import { useToast } from '../../components/ui/ToastContext';

interface ActivityFeedProps {
    customerId: string;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ customerId }) => {
    const { showToast } = useToast();
    const [activities, setActivities] = useState<Activity[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [showLogModal, setShowLogModal] = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [acts, conts] = await Promise.all([
                crmApi.listActivities(customerId),
                crmApi.listContacts(customerId)
            ]);
            setActivities(acts || []);
            setContacts(conts || []);
        } catch (err: unknown) {
            console.error('Failed to load activity data', err);
            showToast('Failed to load activity data', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (customerId) {
            fetchData();
        }
    }, [customerId]);

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'CALL': return '📞';
            case 'MEETING': return '🤝';
            case 'EMAIL': return '✉️';
            case 'NOTE': return '📝';
            default: return '📌';
        }
    };

    const getContactName = (contactId?: string) => {
        if (!contactId) return null;
        const c = contacts.find(x => x.id === contactId);
        return c ? `${c.first_name} ${c.last_name}` : 'Unknown Contact';
    };

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 w-full">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                <h3 className="text-lg font-semibold text-gray-900">Activity History</h3>
                <button
                    onClick={() => setShowLogModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition shadow-sm"
                >
                    + Log Activity
                </button>
            </div>

            {loading ? (
                <div className="py-8 text-center text-gray-500">Loading timeline...</div>
            ) : activities.length === 0 ? (
                <div className="py-8 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    No activities logged yet.
                </div>
            ) : (
                <div className="flow-root">
                    <ul role="list" className="-mb-8">
                        {activities.map((activity, activityIdx) => (
                            <li key={activity.id}>
                                <div className="relative pb-8">
                                    {activityIdx !== activities.length - 1 ? (
                                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                                    ) : null}
                                    <div className="relative flex space-x-3">
                                        <div>
                                            <span className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center ring-8 ring-white border border-gray-200">
                                                {getActivityIcon(activity.activity_type)}
                                            </span>
                                        </div>
                                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                                            <div>
                                                <p className="text-sm text-gray-500">
                                                    <span className="font-medium text-gray-900">{activity.activity_type}</span>
                                                    {activity.contact_id && (
                                                        <> with <span className="font-medium text-gray-900">{getContactName(activity.contact_id)}</span></>
                                                    )}
                                                </p>
                                                <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-md border border-gray-100">
                                                    {activity.description}
                                                </p>
                                            </div>
                                            <div className="whitespace-nowrap text-right text-sm text-gray-500">
                                                <time dateTime={activity.activity_date}>
                                                    {format(new Date(activity.activity_date), 'MMM d, yyyy h:mm a')}
                                                </time>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {showLogModal && (
                <LogActivityModal
                    customerId={customerId}
                    contacts={contacts}
                    onClose={() => setShowLogModal(false)}
                    onSuccess={() => {
                        setShowLogModal(false);
                        fetchData();
                    }}
                />
            )}
        </div>
    );
};
