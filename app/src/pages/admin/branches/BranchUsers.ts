/**
 * <gable-admin-branch-users> — admin page for a single branch's user grants.
 * Mounted at `/admin/branches/:id/users`. The `route-id` attribute carries
 * the branch UUID.
 */
import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons.ts';
import { ArrowLeft, Users, UserPlus, Trash2, Home, X } from 'lucide';
import { LocationService } from '../../../services/LocationService.ts';
import { ToastService } from '../../../lib/toast-service.ts';
import { router } from '../../../lib/router.ts';
import type { Location, UserLocation } from '../../../types/location.ts';

@customElement('gable-admin-branch-users')
export class GableAdminBranchUsers extends LitElement {
  createRenderRoot() { return this; }

  @property({ attribute: 'route-id' }) routeId = '';

  @state() private _branch: Location | null = null;
  @state() private _grants: UserLocation[] = [];
  @state() private _knownUsers: string[] = [];
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _showAdd = false;
  @state() private _newSub = '';
  @state() private _newIsHome = false;
  @state() private _saving = false;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('routeId') && this.routeId) {
      this._load();
    }
  }

  private async _load() {
    if (!this.routeId) return;
    this._loading = true;
    this._error = null;
    try {
      const [branch, grants, users] = await Promise.all([
        LocationService.getBranch(this.routeId),
        LocationService.listBranchUsers(this.routeId),
        LocationService.listKnownUsers(),
      ]);
      this._branch = branch;
      this._grants = grants;
      this._knownUsers = users;
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load branch users';
    } finally {
      this._loading = false;
    }
  }

  private async _grant() {
    const sub = this._newSub.trim();
    if (!sub) {
      ToastService.show('User identifier is required', 'error');
      return;
    }
    this._saving = true;
    try {
      await LocationService.grantUserBranch(sub, this.routeId, this._newIsHome);
      ToastService.show('Access granted', 'success');
      this._showAdd = false;
      this._newSub = '';
      this._newIsHome = false;
      await this._load();
    } catch (err) {
      ToastService.show(
        err instanceof Error ? err.message : 'Failed to grant access',
        'error',
      );
    } finally {
      this._saving = false;
    }
  }

  private async _revoke(g: UserLocation) {
    try {
      await LocationService.revokeUserBranch(g.user_sub, this.routeId);
      ToastService.show(`Revoked ${g.user_sub}`, 'success');
      await this._load();
    } catch (err) {
      ToastService.show(
        err instanceof Error ? err.message : 'Failed to revoke',
        'error',
      );
    }
  }

  private async _setHome(g: UserLocation) {
    try {
      await LocationService.setHomeBranch(g.user_sub, this.routeId);
      ToastService.show(`Home branch set for ${g.user_sub}`, 'success');
      await this._load();
    } catch (err) {
      ToastService.show(
        err instanceof Error ? err.message : 'Failed to set home',
        'error',
      );
    }
  }

  private _back() {
    router.navigate('/admin/branches');
  }

  render() {
    const grantedSubs = new Set(this._grants.map((g) => g.user_sub));
    const availableUsers = this._knownUsers.filter((u) => !grantedSubs.has(u));

    return html`
      <div class="space-y-6">
        <div class="flex items-center gap-3">
          <button
            @click=${() => this._back()}
            class="p-2 rounded hover:bg-white/5 text-zinc-400 hover:text-white"
          >${icon(ArrowLeft, 16)}</button>
          <div>
            <h1 class="text-2xl font-bold text-white flex items-center gap-3">
              <span class="text-gable-green">${icon(Users, 22)}</span>
              ${this._branch ? `${this._branch.code} — ${this._branch.name || ''}` : 'Branch users'}
            </h1>
            <p class="text-sm text-zinc-500 mt-1">Grant or revoke user access to this branch</p>
          </div>
          <div class="flex-1"></div>
          <button
            @click=${() => { this._showAdd = !this._showAdd; }}
            class="flex items-center gap-2 px-4 py-2 bg-gable-green text-deep-space rounded-lg text-sm font-semibold hover:bg-gable-green/90 transition-colors shadow-glow"
          >
            ${icon(UserPlus, 16)} Grant access
          </button>
        </div>

        ${this._error ? html`
          <div class="bg-safety-red/10 border border-safety-red/30 text-safety-red text-sm px-4 py-3 rounded-lg">
            ${this._error}
          </div>
        ` : nothing}

        ${this._showAdd ? html`
          <div class="bg-slate-steel border border-gable-green/30 rounded-xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-white">Grant access</h3>
              <button
                @click=${() => { this._showAdd = false; }}
                class="p-1 rounded hover:bg-white/5 text-zinc-400 hover:text-white"
              >${icon(X, 14)}</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="md:col-span-2">
                <label class="block text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">
                  User identifier (JWT sub)
                </label>
                <input
                  type="text"
                  list="known-users"
                  .value=${this._newSub}
                  @input=${(e: Event) => { this._newSub = (e.target as HTMLInputElement).value; }}
                  placeholder="user@example.com or auth0|abc123"
                  class="w-full bg-deep-space/60 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-gable-green/50"
                />
                <datalist id="known-users">
                  ${availableUsers.map((u) => html`<option value=${u}></option>`)}
                </datalist>
              </div>
              <div>
                <label class="block text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">
                  Home branch
                </label>
                <label class="flex items-center gap-2 text-sm text-zinc-300 mt-2">
                  <input
                    type="checkbox"
                    .checked=${this._newIsHome}
                    @change=${(e: Event) => { this._newIsHome = (e.target as HTMLInputElement).checked; }}
                    class="rounded bg-slate-steel border-white/10 text-gable-green focus:ring-gable-green/30"
                  />
                  Set as user's home
                </label>
              </div>
            </div>
            <div class="flex items-center justify-end gap-2">
              <button
                @click=${() => { this._showAdd = false; }}
                ?disabled=${this._saving}
                class="px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5 rounded transition-colors"
              >Cancel</button>
              <button
                @click=${() => this._grant()}
                ?disabled=${this._saving}
                class="px-3 py-1.5 text-sm font-semibold bg-gable-green text-deep-space rounded hover:bg-gable-green/90 transition-colors disabled:opacity-50"
              >${this._saving ? 'Saving...' : 'Grant'}</button>
            </div>
          </div>
        ` : nothing}

        <div class="bg-slate-steel border border-white/5 rounded-xl overflow-hidden">
          ${this._loading ? html`
            <div class="p-12 text-center text-zinc-500 text-sm">Loading...</div>
          ` : this._grants.length === 0 ? html`
            <div class="p-12 text-center text-zinc-500 text-sm">No users have access to this branch yet.</div>
          ` : html`
            <table class="w-full text-sm">
              <thead class="bg-deep-space/40 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th class="text-left px-4 py-3 font-semibold">User</th>
                  <th class="text-left px-4 py-3 font-semibold">Granted</th>
                  <th class="text-left px-4 py-3 font-semibold">Granted by</th>
                  <th class="text-left px-4 py-3 font-semibold">Home</th>
                  <th class="text-right px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${this._grants.map((g) => html`
                  <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-4 py-3 text-white font-mono text-xs">${g.user_sub}</td>
                    <td class="px-4 py-3 text-zinc-400 text-xs">${this._fmt(g.granted_at)}</td>
                    <td class="px-4 py-3 text-zinc-400 font-mono text-xs">${g.granted_by || '—'}</td>
                    <td class="px-4 py-3">
                      ${g.is_home
                        ? html`<span class="text-xs px-2 py-0.5 rounded-full bg-gable-green/15 text-gable-green font-semibold">Home</span>`
                        : html`
                          <button
                            @click=${() => this._setHome(g)}
                            class="text-xs text-zinc-500 hover:text-gable-green flex items-center gap-1"
                          >${icon(Home, 12)} Make home</button>
                        `}
                    </td>
                    <td class="px-4 py-3 text-right">
                      <button
                        @click=${() => this._revoke(g)}
                        title="Revoke access"
                        class="p-1.5 rounded hover:bg-white/5 text-zinc-400 hover:text-safety-red transition-colors"
                      >${icon(Trash2, 14)}</button>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;
  }

  private _fmt(s: string): string {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
