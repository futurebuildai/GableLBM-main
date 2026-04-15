import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { Users, UserPlus, RefreshCw, AlertTriangle, Shield, CheckCircle2, XCircle, Clock } from 'lucide';
import { PortalService } from '../../services/PortalService';
import type { PortalUser, PortalInvite } from '../../types/portal';

@customElement('gable-portal-team')
export class PortalTeam extends LitElement {
    createRenderRoot() { return this; }

    @state() private users: PortalUser[] = [];
    @state() private invites: PortalInvite[] = [];
    @state() private loading = true;
    @state() private error = '';

    connectedCallback() {
        super.connectedCallback();
        this._fetchData();
    }

    private async _fetchData() {
        this.loading = true;
        this.error = '';
        try {
            const [usersData, invitesData] = await Promise.all([
                PortalService.getUsers(),
                PortalService.getInvites()
            ]);
            this.users = usersData;
            this.invites = invitesData;
        } catch (err) {
            this.error = err instanceof Error ? err.message : 'Failed to load team data';
        } finally {
            this.loading = false;
        }
    }

    private async _handleRoleChange(userId: string, newRole: string) {
        try {
            await PortalService.updateUserRole(userId, { role: newRole });
            ToastService.show('Role updated successfully', 'success');
            this._fetchData();
        } catch (err) {
            ToastService.show(err instanceof Error ? err.message : 'Failed to update role', 'error');
        }
    }

    private async _handleStatusChange(userId: string, newStatus: string) {
        try {
            await PortalService.updateUserStatus(userId, { status: newStatus });
            ToastService.show(`User marked as ${newStatus}`, 'success');
            this._fetchData();
        } catch (err) {
            ToastService.show(err instanceof Error ? err.message : 'Failed to update status', 'error');
        }
    }

    render() {
        if (this.loading) {
            return html`
                <div class="space-y-4">
                    <div class="h-10 w-1/4 bg-white/5 rounded-lg animate-pulse mb-6"></div>
                    ${[1, 2, 3].map(() => html`<div class="h-16 bg-white/5 rounded-2xl animate-pulse"></div>`)}
                </div>
            `;
        }

        if (this.error) {
            return html`
                <div class="flex flex-col items-center justify-center h-64 text-center">
                    ${icon(AlertTriangle, 48, 'text-amber-500 mb-4')}
                    <p class="text-zinc-400 mb-4">${this.error}</p>
                    <button
                        @click=${() => this._fetchData()}
                        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                    >
                        ${icon(RefreshCw, 16)} Retry
                    </button>
                </div>
            `;
        }

        return html`
            <div>
                <div class="mb-6 flex items-center justify-between">
                    <div>
                        <h1 class="text-2xl font-bold text-white">Team Management</h1>
                        <p class="text-zinc-400 text-sm mt-1">Manage portal access for your company</p>
                    </div>
                    <button
                        @click=${() => router.navigate('/portal/team/invite')}
                        class="flex items-center gap-2 px-4 py-2 bg-gable-green text-black font-semibold rounded-lg hover:bg-emerald-400 transition-colors shadow-[0_0_15px_rgba(0,255,163,0.3)]"
                    >
                        ${icon(UserPlus, 18)} Invite Member
                    </button>
                </div>

                <div class="space-y-8">
                    <!-- Active Members -->
                    <div>
                        <h2 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
                            ${icon(Users, 18, 'text-zinc-400')} Current Members
                        </h2>
                        <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl overflow-hidden">
                            <div class="divide-y divide-white/5">
                                ${this.users.map(user => html`
                                    <div class="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                                        <div class="flex items-center gap-4">
                                            <div class="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white font-medium">
                                                ${user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div class="font-medium text-white flex items-center gap-2">
                                                    ${user.name}
                                                    ${user.status === 'Inactive' ? html`
                                                        <span class="text-[10px] uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-semibold tracking-wider">
                                                            Inactive
                                                        </span>
                                                    ` : nothing}
                                                </div>
                                                <div class="text-sm text-zinc-500">${user.email}</div>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <div class="relative">
                                                <select
                                                    .value=${user.role}
                                                    @change=${(e: Event) => this._handleRoleChange(user.id, (e.target as HTMLSelectElement).value)}
                                                    class="appearance-none bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 pr-8 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green cursor-pointer"
                                                >
                                                    <option value="View-Only" class="bg-zinc-900">View-Only</option>
                                                    <option value="Buyer" class="bg-zinc-900">Buyer</option>
                                                    <option value="Admin" class="bg-zinc-900">Admin</option>
                                                </select>
                                                ${icon(Shield, 14, 'absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none')}
                                            </div>

                                            ${user.status === 'Active' ? html`
                                                <button
                                                    @click=${() => this._handleStatusChange(user.id, 'Inactive')}
                                                    class="p-2 text-zinc-500 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
                                                    title="Deactivate User"
                                                >
                                                    ${icon(XCircle, 18)}
                                                </button>
                                            ` : html`
                                                <button
                                                    @click=${() => this._handleStatusChange(user.id, 'Active')}
                                                    class="p-2 text-zinc-500 hover:text-emerald-400 hover:bg-white/5 rounded-lg transition-colors"
                                                    title="Reactivate User"
                                                >
                                                    ${icon(CheckCircle2, 18)}
                                                </button>
                                            `}
                                        </div>
                                    </div>
                                `)}
                            </div>
                        </div>
                    </div>

                    <!-- Pending Invites -->
                    ${this.invites.length > 0 ? html`
                        <div>
                            <h2 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                ${icon(Clock, 18, 'text-zinc-400')} Pending Invites
                            </h2>
                            <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl overflow-hidden">
                                <div class="divide-y divide-white/5">
                                    ${this.invites.map(invite => html`
                                        <div class="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div class="flex items-center gap-4">
                                                <div class="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                                                    ${icon(UserPlus, 18)}
                                                </div>
                                                <div>
                                                    <div class="font-medium text-white">${invite.email}</div>
                                                    <div class="text-sm text-zinc-500">
                                                        Invited on ${new Date(invite.created_at).toLocaleDateString()} · Expires ${new Date(invite.expires_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="flex items-center gap-3">
                                                <span class="px-2 py-1 rounded bg-white/5 text-zinc-300 text-xs font-medium border border-white/10">
                                                    ${invite.role}
                                                </span>
                                                <span class="text-[10px] uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold tracking-wider">
                                                    Pending
                                                </span>
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            </div>
                        </div>
                    ` : nothing}
                </div>
            </div>
        `;
    }
}
