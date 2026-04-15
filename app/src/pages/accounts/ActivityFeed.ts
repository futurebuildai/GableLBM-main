import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { crmApi } from '../../services/crmApi.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { format } from 'date-fns';
import type { Activity, Contact } from '../../types/crm.ts';

@customElement('gable-activity-feed')
export class GableActivityFeed extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: String }) customerId = '';

    @state() private activities: Activity[] = [];
    @state() private contacts: Contact[] = [];
    @state() private loading = true;

    connectedCallback() {
        super.connectedCallback();
        if (this.customerId) {
            this._fetchData();
        }
    }

    updated(changedProperties: Map<string, unknown>) {
        if (changedProperties.has('customerId') && this.customerId) {
            this._fetchData();
        }
    }

    private async _fetchData() {
        try {
            this.loading = true;
            const [acts, conts] = await Promise.all([
                crmApi.listActivities(this.customerId),
                crmApi.listContacts(this.customerId),
            ]);
            this.activities = acts || [];
            this.contacts = conts || [];
        } catch (err: unknown) {
            console.error('Failed to load activity data', err);
            ToastService.show('Failed to load activity data', 'error');
        } finally {
            this.loading = false;
        }
    }

    private _getActivityIcon(type: string): string {
        switch (type) {
            case 'CALL': return '\u{1F4DE}';
            case 'MEETING': return '\u{1F91D}';
            case 'EMAIL': return '\u{2709}\u{FE0F}';
            case 'NOTE': return '\u{1F4DD}';
            default: return '\u{1F4CC}';
        }
    }

    private _getContactName(contactId?: string): string | null {
        if (!contactId) return null;
        const c = this.contacts.find(x => x.id === contactId);
        return c ? `${c.first_name} ${c.last_name}` : 'Unknown Contact';
    }

    private _openLogModal() {
        this.dispatchEvent(new CustomEvent('open-log-modal', {
            detail: { customerId: this.customerId, contacts: this.contacts },
            bubbles: true,
            composed: true,
        }));
    }

    private _closeLogModal() {
    }

    /** Called externally or via event to refresh data after logging an activity */
    public refresh() {
        this._closeLogModal();
        this._fetchData();
    }

    render() {
        return html`
            <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-6 w-full">
                <div class="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                    <h3 class="text-lg font-semibold text-gray-900">Activity History</h3>
                    <button
                        @click=${this._openLogModal}
                        class="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition shadow-sm"
                    >
                        + Log Activity
                    </button>
                </div>

                ${this.loading
                    ? html`<div class="py-8 text-center text-gray-500">Loading timeline...</div>`
                    : this.activities.length === 0
                        ? html`
                            <div class="py-8 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                No activities logged yet.
                            </div>
                        `
                        : html`
                            <div class="flow-root">
                                <ul role="list" class="-mb-8">
                                    ${this.activities.map((activity, activityIdx) => html`
                                        <li>
                                            <div class="relative pb-8">
                                                ${activityIdx !== this.activities.length - 1
                                                    ? html`<span class="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>`
                                                    : nothing
                                                }
                                                <div class="relative flex space-x-3">
                                                    <div>
                                                        <span class="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center ring-8 ring-white border border-gray-200">
                                                            ${this._getActivityIcon(activity.activity_type)}
                                                        </span>
                                                    </div>
                                                    <div class="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                                                        <div>
                                                            <p class="text-sm text-gray-500">
                                                                <span class="font-medium text-gray-900">${activity.activity_type}</span>
                                                                ${activity.contact_id ? html`
                                                                    with <span class="font-medium text-gray-900">${this._getContactName(activity.contact_id)}</span>
                                                                ` : nothing}
                                                            </p>
                                                            <p class="mt-2 text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-md border border-gray-100">
                                                                ${activity.description}
                                                            </p>
                                                        </div>
                                                        <div class="whitespace-nowrap text-right text-sm text-gray-500">
                                                            <time datetime="${activity.activity_date}">
                                                                ${format(new Date(activity.activity_date), 'MMM d, yyyy h:mm a')}
                                                            </time>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    `)}
                                </ul>
                            </div>
                        `
                }
            </div>
        `;
    }
}
