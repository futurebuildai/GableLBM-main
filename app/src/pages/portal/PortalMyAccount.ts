import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { router } from '../../lib/router.ts';
import { CustomerService } from '../../services/CustomerService';
import { fetchWithAuth } from '../../services/fetchClient';
import type { Customer } from '../../types/customer';

const API_URL = import.meta.env.VITE_API_URL || '';

@customElement('gable-portal-my-account')
export class PortalMyAccount extends LitElement {
    createRenderRoot() { return this; }

    @state() private customer: Customer | null = null;
    @state() private loading = true;
    @state() private error: string | null = null;
    @state() private saving = false;
    @state() private successMsg = '';
    @state() private portalCustomerId = '';

    private _successTimer: ReturnType<typeof setTimeout> | null = null;

    connectedCallback() {
        super.connectedCallback();
        try {
            const storedUser = localStorage.getItem('portal_user');
            const parsed = storedUser ? JSON.parse(storedUser) : null;
            this.portalCustomerId = parsed?.customer_id || '';
        } catch {
            this.portalCustomerId = '';
        }
        this._loadProfile();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._successTimer) clearTimeout(this._successTimer);
    }

    private async _loadProfile() {
        if (!this.portalCustomerId) {
            this.loading = false;
            this.error = 'No portal session found. Redirecting to login...';
            router.navigate('/portal/login');
            return;
        }
        try {
            this.loading = true;
            const data = await CustomerService.getCustomer(this.portalCustomerId);
            this.customer = data;
            this.error = null;
        } catch (err: unknown) {
            this.error = err instanceof Error ? err.message : 'Failed to load profile';
        } finally {
            this.loading = false;
        }
    }

    private _handleInputChange(e: InputEvent) {
        if (!this.customer) return;
        const target = e.target as HTMLInputElement;
        const name = target.name;
        const value = target.value;
        this.customer = { ...this.customer, [name]: value };
    }

    private async _handleSubmit(e: Event) {
        e.preventDefault();
        if (!this.customer) return;
        try {
            this.saving = true;
            this.successMsg = '';
            this.error = null;

            const res = await fetchWithAuth(`${API_URL}/api/v1/customers/${this.portalCustomerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.customer),
            });

            if (!res.ok) throw new Error('Failed to update profile');

            this.successMsg = 'Profile updated successfully!';
            this._successTimer = setTimeout(() => { this.successMsg = ''; }, 3000);
        } catch (err: unknown) {
            this.error = err instanceof Error ? err.message : 'Error saving profile';
        } finally {
            this.saving = false;
        }
    }

    render() {
        if (this.loading) return html`<div class="p-8 text-center text-zinc-500">Loading your profile...</div>`;
        if (this.error && !this.customer) return html`<div class="p-8 text-center text-red-500">${this.error}</div>`;
        if (!this.customer) return nothing;

        const c = this.customer;

        return html`
            <div class="max-w-3xl mx-auto space-y-6">
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 mb-2">My Account</h1>
                    <p class="text-gray-500 text-sm">Update your company's primary contact information and preferences.</p>
                </div>

                <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <form @submit=${(e: Event) => this._handleSubmit(e)} class="p-6">
                        ${this.error ? html`<div class="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">${this.error}</div>` : nothing}
                        ${this.successMsg ? html`<div class="mb-4 p-3 bg-green-50 text-green-700 rounded-md text-sm">${this.successMsg}</div>` : nothing}

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="col-span-2">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    .value=${c.name}
                                    @input=${(e: InputEvent) => this._handleInputChange(e)}
                                    required
                                    class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            <div class="col-span-2 md:col-span-1">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                                <input
                                    type="text"
                                    .value=${c.account_number}
                                    readonly
                                    class="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded cursor-not-allowed"
                                />
                                <p class="text-xs text-gray-500 mt-1">Account numbers cannot be changed.</p>
                            </div>

                            <div class="col-span-2 md:col-span-1">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Tier / Price Level</label>
                                <input
                                    type="text"
                                    .value=${c.price_level ? `(${c.price_level.name})` : ''}
                                    readonly
                                    class="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded cursor-not-allowed"
                                />
                            </div>

                            <div class="col-span-2 md:col-span-1">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Primary Email</label>
                                <input
                                    type="email"
                                    name="email"
                                    .value=${c.email || ''}
                                    @input=${(e: InputEvent) => this._handleInputChange(e)}
                                    class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            <div class="col-span-2 md:col-span-1">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Primary Phone</label>
                                <input
                                    type="text"
                                    name="phone"
                                    .value=${c.phone || ''}
                                    @input=${(e: InputEvent) => this._handleInputChange(e)}
                                    class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            <div class="col-span-2">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Billing Address</label>
                                <input
                                    type="text"
                                    name="address"
                                    .value=${c.address || ''}
                                    @input=${(e: InputEvent) => this._handleInputChange(e)}
                                    class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <div class="mt-8 flex justify-end">
                            <button
                                type="submit"
                                ?disabled=${this.saving}
                                class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                                ${this.saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </div>

                <div class="bg-gray-50 p-6 rounded-lg border border-gray-200 text-sm text-gray-600 flex items-start gap-4">
                    <div class="text-blue-500 mt-0.5">i</div>
                    <div>
                        <p class="font-semibold text-gray-900 mb-1">Need to update individual contacts?</p>
                        <p>If you need to add or remove individual buyers or AP contacts, please reach out to your sales representative. We currently restrict adding secondary contacts from the portal to ensure account security.</p>
                    </div>
                </div>
            </div>
        `;
    }
}
