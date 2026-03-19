import React, { useState, useEffect } from 'react';
import { CustomerService } from '../../services/CustomerService';
import type { Customer } from '../../types/customer';
import { Button } from '../../components/ui/Button';

export function PortalMyAccount() {
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    // TODO: Resolve from auth context
    const portalCustomerId = '364a0cd6-c7f2-4529-92c7-3639c36f6b8f';

    useEffect(() => {
        async function loadProfile() {
            try {
                setLoading(true);
                const data = await CustomerService.getCustomer(portalCustomerId);
                setCustomer(data);
                setError(null);
            } catch (err: any) {
                setError(err.message || 'Failed to load profile');
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!customer) return;
        const { name, value } = e.target;
        setCustomer({ ...customer, [name]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!customer) return;
        try {
            setSaving(true);
            setSuccessMsg('');
            setError(null);

            const API_BASE = '';
            const res = await fetch(`${API_BASE}/api/v1/customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(customer),
            });

            if (!res.ok) throw new Error('Failed to update profile');

            setSuccessMsg('Profile updated successfully!');
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err: any) {
            setError(err.message || 'Error saving profile');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-zinc-500">Loading your profile...</div>;
    if (error && !customer) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!customer) return null;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">My Account</h1>
                <p className="text-gray-500 text-sm">Update your company's primary contact information and preferences.</p>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <form onSubmit={handleSubmit} className="p-6">
                    {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>}
                    {successMsg && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md text-sm">{successMsg}</div>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                            <input
                                type="text"
                                name="name"
                                value={customer.name}
                                onChange={handleInputChange}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                            <input
                                type="text"
                                value={customer.account_number}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded cursor-not-allowed"
                            />
                            <p className="text-xs text-gray-500 mt-1">Account numbers cannot be changed.</p>
                        </div>

                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tier / Price Level</label>
                            <input
                                type="text"
                                value={customer.price_level ? `(${customer.price_level.name})` : ''}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded cursor-not-allowed"
                            />
                        </div>

                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Primary Email</label>
                            <input
                                type="email"
                                name="email"
                                value={customer.email || ''}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Primary Phone</label>
                            <input
                                type="text"
                                name="phone"
                                value={customer.phone || ''}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Address</label>
                            <input
                                type="text"
                                name="address"
                                value={customer.address || ''}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end">
                        <Button
                            type="submit"
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </form>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-sm text-gray-600 flex items-start gap-4">
                <div className="text-blue-500 mt-0.5">ℹ️</div>
                <div>
                    <p className="font-semibold text-gray-900 mb-1">Need to update individual contacts?</p>
                    <p>If you need to add or remove individual buyers or AP contacts, please reach out to your sales representative. We currently restrict adding secondary contacts from the portal to ensure account security.</p>
                </div>
            </div>
        </div>
    );
}
