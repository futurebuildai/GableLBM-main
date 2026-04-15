import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { crmApi } from '../../services/crmApi.ts';
import { ToastService } from '../../lib/toast-service.ts';
import type { Contact, CreateContactRequest } from '../../types/crm.ts';

@customElement('gable-contact-list')
export class GableContactList extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: String }) customerId = '';

    @state() private contacts: Contact[] = [];
    @state() private loading = true;
    @state() private error: string | null = null;
    @state() private showAddForm = false;
    @state() private formData: CreateContactRequest = {
        first_name: '',
        last_name: '',
        title: '',
        email: '',
        phone: '',
        role: 'Buyer',
        is_primary: false,
        is_active: true,
    };

    connectedCallback() {
        super.connectedCallback();
        if (this.customerId) {
            this._fetchContacts();
        }
    }

    updated(changedProperties: Map<string, unknown>) {
        if (changedProperties.has('customerId') && this.customerId) {
            this._fetchContacts();
        }
    }

    private async _fetchContacts() {
        try {
            this.loading = true;
            const data = await crmApi.listContacts(this.customerId);
            this.contacts = data || [];
            this.error = null;
        } catch (err: unknown) {
            this.error = err instanceof Error ? err.message : 'Failed to load contacts';
        } finally {
            this.loading = false;
        }
    }

    private _handleInputChange(e: Event) {
        const target = e.target as HTMLInputElement | HTMLSelectElement;
        const name = target.name;
        const value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
        this.formData = { ...this.formData, [name]: value };
    }

    private async _handleSubmit(e: Event) {
        e.preventDefault();
        try {
            await crmApi.createContact(this.customerId, this.formData);
            this.showAddForm = false;
            this.formData = {
                first_name: '',
                last_name: '',
                title: '',
                email: '',
                phone: '',
                role: 'Buyer',
                is_primary: false,
                is_active: true,
            };
            this._fetchContacts();
        } catch (err: unknown) {
            ToastService.show(err instanceof Error ? err.message : 'Failed to create contact', 'error');
        }
    }

    private async _handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this contact?')) return;
        try {
            await crmApi.deleteContact(id);
            this._fetchContacts();
        } catch (err: unknown) {
            ToastService.show(err instanceof Error ? err.message : 'Failed to delete contact', 'error');
        }
    }

    render() {
        if (this.loading) return html`<div>Loading contacts...</div>`;
        if (this.error) return html`<div class="text-red-500">${this.error}</div>`;

        return html`
            <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-lg font-semibold text-gray-900">Contacts</h3>
                    <button
                        @click=${() => this.showAddForm = !this.showAddForm}
                        class="px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition"
                    >
                        ${this.showAddForm ? 'Cancel' : 'Add Contact'}
                    </button>
                </div>

                ${this.showAddForm ? html`
                    <form @submit=${this._handleSubmit} class="mb-6 p-4 bg-gray-50 rounded border border-gray-200">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                                <input
                                    type="text"
                                    name="first_name"
                                    required
                                    .value=${this.formData.first_name}
                                    @input=${this._handleInputChange}
                                    class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                                <input
                                    type="text"
                                    name="last_name"
                                    required
                                    .value=${this.formData.last_name}
                                    @input=${this._handleInputChange}
                                    class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                <select
                                    name="role"
                                    .value=${this.formData.role}
                                    @change=${this._handleInputChange}
                                    class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="Buyer">Buyer</option>
                                    <option value="AP">Accounts Payable</option>
                                    <option value="Owner">Owner</option>
                                    <option value="Site Super">Site Super</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Title (Optional)</label>
                                <input
                                    type="text"
                                    name="title"
                                    .value=${this.formData.title}
                                    @input=${this._handleInputChange}
                                    class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    name="email"
                                    .value=${this.formData.email}
                                    @input=${this._handleInputChange}
                                    class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                <input
                                    type="text"
                                    name="phone"
                                    .value=${this.formData.phone}
                                    @input=${this._handleInputChange}
                                    class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <label class="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    name="is_primary"
                                    .checked=${this.formData.is_primary}
                                    @change=${this._handleInputChange}
                                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <span class="text-sm font-medium text-gray-700">Primary Contact</span>
                            </label>
                            <button
                                type="submit"
                                class="ml-auto px-4 py-2 bg-green-600 text-white font-medium rounded hover:bg-green-700 transition"
                            >
                                Save Contact
                            </button>
                        </div>
                    </form>
                ` : nothing}

                ${this.contacts.length === 0
                    ? html`
                        <div class="text-center py-8 text-gray-500 bg-gray-50 rounded border border-dashed border-gray-300">
                            No contacts found for this account.
                        </div>
                    `
                    : html`
                        <div class="overflow-hidden shadow-sm ring-1 ring-black ring-opacity-5 rounded-lg">
                            <table class="min-w-full divide-y divide-gray-300">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th scope="col" class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Name</th>
                                        <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Role</th>
                                        <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Contact Info</th>
                                        <th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-6"><span class="sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200 bg-white">
                                    ${this.contacts.map((contact) => html`
                                        <tr>
                                            <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                                ${contact.first_name} ${contact.last_name}
                                                ${contact.is_primary ? html`
                                                    <span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                        Primary
                                                    </span>
                                                ` : nothing}
                                                ${contact.title ? html`<div class="text-xs text-gray-500 font-normal">${contact.title}</div>` : nothing}
                                            </td>
                                            <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                    ${contact.role}
                                                </span>
                                            </td>
                                            <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                ${contact.email ? html`<div class="truncate">${contact.email}</div>` : nothing}
                                                ${contact.phone ? html`<div>${contact.phone}</div>` : nothing}
                                                ${!contact.email && !contact.phone ? html`<span class="text-gray-400 italic">No contact info</span>` : nothing}
                                            </td>
                                            <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                                <button
                                                    @click=${() => this._handleDelete(contact.id)}
                                                    class="text-red-600 hover:text-red-900 ml-4"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    `
                }
            </div>
        `;
    }
}
