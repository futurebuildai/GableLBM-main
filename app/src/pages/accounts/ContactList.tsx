import React, { useState, useEffect } from 'react';
import type { Contact, CreateContactRequest } from '../../types/crm';
import { crmApi } from '../../services/crmApi';
import { useToast } from '../../components/ui/ToastContext';

interface ContactListProps {
    customerId: string;
}

export const ContactList: React.FC<ContactListProps> = ({ customerId }) => {
    const { showToast } = useToast();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState<CreateContactRequest>({
        first_name: '',
        last_name: '',
        title: '',
        email: '',
        phone: '',
        role: 'Buyer',
        is_primary: false,
        is_active: true,
    });

    const fetchContacts = async () => {
        try {
            setLoading(true);
            const data = await crmApi.listContacts(customerId);
            setContacts(data || []);
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load contacts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (customerId) {
            fetchContacts();
        }
    }, [customerId]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await crmApi.createContact(customerId, formData);
            setShowAddForm(false);
            setFormData({
                first_name: '',
                last_name: '',
                title: '',
                email: '',
                phone: '',
                role: 'Buyer',
                is_primary: false,
                is_active: true,
            });
            fetchContacts();
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to create contact', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this contact?')) return;
        try {
            await crmApi.deleteContact(id);
            fetchContacts();
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to delete contact', 'error');
        }
    };

    if (loading) return <div>Loading contacts...</div>;
    if (error) return <div className="text-red-500">{error}</div>;

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Contacts</h3>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition"
                >
                    {showAddForm ? 'Cancel' : 'Add Contact'}
                </button>
            </div>

            {showAddForm && (
                <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                            <input
                                type="text"
                                name="first_name"
                                required
                                value={formData.first_name}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                            <input
                                type="text"
                                name="last_name"
                                required
                                value={formData.last_name}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                            <select
                                name="role"
                                value={formData.role}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="Buyer">Buyer</option>
                                <option value="AP">Accounts Payable</option>
                                <option value="Owner">Owner</option>
                                <option value="Site Super">Site Super</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Title (Optional)</label>
                            <input
                                type="text"
                                name="title"
                                value={formData.title}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                            <input
                                type="text"
                                name="phone"
                                value={formData.phone}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                name="is_primary"
                                checked={formData.is_primary}
                                onChange={handleInputChange}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="text-sm font-medium text-gray-700">Primary Contact</span>
                        </label>
                        <button
                            type="submit"
                            className="ml-auto px-4 py-2 bg-green-600 text-white font-medium rounded hover:bg-green-700 transition"
                        >
                            Save Contact
                        </button>
                    </div>
                </form>
            )}

            {contacts.length === 0 ? (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded border border-dashed border-gray-300">
                    No contacts found for this account.
                </div>
            ) : (
                <div className="overflow-hidden shadow-sm ring-1 ring-black ring-opacity-5 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Name</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Role</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Contact Info</th>
                                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {contacts.map((contact) => (
                                <tr key={contact.id}>
                                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                        {contact.first_name} {contact.last_name}
                                        {contact.is_primary && (
                                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                Primary
                                            </span>
                                        )}
                                        {contact.title && <div className="text-xs text-gray-500 font-normal">{contact.title}</div>}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                            {contact.role}
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                        {contact.email && <div className="truncate">{contact.email}</div>}
                                        {contact.phone && <div>{contact.phone}</div>}
                                        {!contact.email && !contact.phone && <span className="text-gray-400 italic">No contact info</span>}
                                    </td>
                                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                        <button
                                            onClick={() => handleDelete(contact.id)}
                                            className="text-red-600 hover:text-red-900 ml-4"
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
};
