import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { Mail, Shield, UserPlus, ArrowLeft, Loader2 } from 'lucide';
import { PortalService } from '../../services/PortalService';

@customElement('gable-portal-invite')
export class PortalInvite extends LitElement {
    createRenderRoot() { return this; }

    @state() private email = '';
    @state() private _selectedRole = 'Buyer';
    @state() private submitting = false;

    private async _handleSubmit(e: Event) {
        e.preventDefault();
        if (!this.email) return;

        this.submitting = true;
        try {
            await PortalService.inviteUser({ email: this.email, role: this._selectedRole });
            ToastService.show(`Invitation sent to ${this.email}`, 'success');
            router.navigate('/portal/team');
        } catch (err) {
            ToastService.show(err instanceof Error ? err.message : 'Failed to send invite', 'error');
            this.submitting = false;
        }
    }

    render() {
        const roles = ['View-Only', 'Buyer', 'Admin'];
        const roleDescriptions: Record<string, string> = {
            'View-Only': 'Can view orders, invoices, and catalog. Cannot place orders.',
            'Buyer': 'Can view items and place new orders on account.',
            'Admin': 'Full access. Can place orders and manage company team members.',
        };

        return html`
            <div class="max-w-2xl mx-auto">
                <div class="mb-6 flex items-center gap-4">
                    <button
                        @click=${() => router.navigate('/portal/team')}
                        class="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                        ${icon(ArrowLeft, 20)}
                    </button>
                    <div>
                        <h1 class="text-2xl font-bold text-white">Invite Team Member</h1>
                        <p class="text-zinc-400 text-sm mt-1">Send an invitation to join your company's portal</p>
                    </div>
                </div>

                <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl p-1">
                    <div class="p-6">
                        <form @submit=${(e: Event) => this._handleSubmit(e)} class="space-y-6">
                            <div>
                                <label class="block text-sm font-medium text-zinc-300 mb-2">Email Address</label>
                                <div class="relative">
                                    ${icon(Mail, 18, 'absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500')}
                                    <input
                                        type="email"
                                        required
                                        .value=${this.email}
                                        @input=${(e: InputEvent) => { this.email = (e.target as HTMLInputElement).value; }}
                                        placeholder="colleague@company.com"
                                        class="w-full bg-black/20 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-gable-green transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-zinc-300 mb-2">Role & Permissions</label>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    ${roles.map(r => html`
                                        <label
                                            class="relative flex flex-col p-4 cursor-pointer rounded-xl border transition-all ${this._selectedRole === r
                                                ? 'bg-[#00FFA3]/10 border-[#00FFA3] shadow-[0_0_15px_rgba(0,255,163,0.1)]'
                                                : 'bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/20'
                                            }"
                                        >
                                            <input
                                                type="radio"
                                                name="role"
                                                .value=${r}
                                                .checked=${this._selectedRole === r}
                                                @change=${() => { this._selectedRole = r; }}
                                                class="sr-only"
                                            />
                                            <div class="flex items-center justify-between mb-2">
                                                <span class="font-semibold ${this._selectedRole === r ? 'text-[#00FFA3]' : 'text-white'}">${r}</span>
                                                ${this._selectedRole === r ? icon(Shield, 16, 'text-[#00FFA3]') : ''}
                                            </div>
                                            <span class="text-xs text-zinc-500 leading-relaxed">
                                                ${roleDescriptions[r]}
                                            </span>
                                        </label>
                                    `)}
                                </div>
                            </div>

                            <div class="pt-4 border-t border-white/5 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    @click=${() => router.navigate('/portal/team')}
                                    class="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    ?disabled=${this.submitting || !this.email}
                                    class="flex items-center gap-2 px-6 py-2 bg-gable-green text-black font-semibold rounded-lg hover:bg-emerald-400 transition-all shadow-[0_0_15px_rgba(0,255,163,0.3)] disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
                                >
                                    ${this.submitting ? icon(Loader2, 18, 'animate-spin') : icon(UserPlus, 18)}
                                    Send Invitation
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }
}
