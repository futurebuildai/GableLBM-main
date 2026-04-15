import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { CreateActivityRequest, Contact, ActivityType } from '../../types/crm';
import { crmApi } from '../../services/crmApi';
import { ToastService } from '../../lib/toast-service';

const ACTIVITY_TYPES: ActivityType[] = ['CALL', 'MEETING', 'EMAIL', 'NOTE'];

@customElement('gable-log-activity-modal')
export class GableLogActivityModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String, attribute: 'customer-id' }) customerId = '';
  @property({ type: Array }) contacts: Contact[] = [];

  @state() private _loading = false;
  @state() private _activityType: ActivityType = 'CALL';
  @state() private _description = '';
  @state() private _activityDate = new Date().toISOString().slice(0, 16);
  @state() private _contactId = '';

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    try {
      this._loading = true;
      const payload: CreateActivityRequest = {
        activity_type: this._activityType,
        description: this._description,
        activity_date: new Date(this._activityDate).toISOString(),
        contact_id: this._contactId === '' ? undefined : this._contactId,
      };
      await crmApi.createActivity(this.customerId, payload);
      this.dispatchEvent(new CustomEvent('success', { bubbles: true, composed: true }));
    } catch (err: unknown) {
      ToastService.show(err instanceof Error ? err.message : 'Failed to log activity', 'error');
    } finally {
      this._loading = false;
    }
  }

  private _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="fixed inset-0 bg-gray-600 bg-opacity-75 flex justify-center items-center z-50">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
            <h3 class="text-lg font-bold text-gray-900">Log Activity</h3>
            <button @click=${this._close} class="text-gray-400 hover:text-gray-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <form @submit=${this._handleSubmit} class="px-6 py-4">
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-1">Activity Type</label>
              <div class="grid grid-cols-4 gap-2">
                ${ACTIVITY_TYPES.map(type => html`
                  <button
                    type="button"
                    @click=${() => this._activityType = type}
                    class="px-3 py-2 text-sm font-medium rounded-md border ${this._activityType === type
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }"
                  >
                    ${type}
                  </button>
                `)}
              </div>
            </div>

            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
              <input
                type="datetime-local"
                required
                .value=${this._activityDate}
                @input=${(e: InputEvent) => this._activityDate = (e.target as HTMLInputElement).value}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-1">Contact (Optional)</label>
              <select
                .value=${this._contactId}
                @change=${(e: Event) => this._contactId = (e.target as HTMLSelectElement).value}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- No Specific Contact --</option>
                ${this.contacts.map(c => html`
                  <option value=${c.id}>${c.first_name} ${c.last_name} (${c.role})</option>
                `)}
              </select>
            </div>

            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 mb-1">Description / Notes</label>
              <textarea
                required
                rows="4"
                .value=${this._description}
                @input=${(e: InputEvent) => this._description = (e.target as HTMLTextAreaElement).value}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="Details about the ${this._activityType.toLowerCase()}..."
              ></textarea>
            </div>

            <div class="flex justify-end gap-3">
              <button type="button" @click=${this._close}
                class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" ?disabled=${this._loading}
                class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                ${this._loading ? 'Saving...' : 'Log Activity'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-log-activity-modal': GableLogActivityModal;
  }
}
