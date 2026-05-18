/**
 * <gable-admin-branches> — admin page to list, create, edit, and archive
 * branches. Mounted at `/admin/branches` (erp layout, admin-only).
 */
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons.ts';
import { Building2, Plus, Pencil, Archive, Users, X } from 'lucide';
import { LocationService } from '../../../services/LocationService.ts';
import { branchContext } from '../../../services/BranchContext.ts';
import { ToastService } from '../../../lib/toast-service.ts';
import type { Location } from '../../../types/location.ts';
import { router } from '../../../lib/router.ts';

interface BranchForm {
  id?: string;
  code: string;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  timezone?: string;
  active: boolean;
}

const EMPTY_FORM: BranchForm = {
  code: '',
  name: '',
  description: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  timezone: 'America/New_York',
  active: true,
};

@customElement('gable-admin-branches')
export class GableAdminBranches extends LitElement {
  createRenderRoot() { return this; }

  @state() private _branches: Location[] = [];
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _showInactive = false;
  @state() private _editorOpen = false;
  @state() private _saving = false;
  @state() private _form: BranchForm = { ...EMPTY_FORM };

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = null;
    try {
      this._branches = await LocationService.listBranches(this._showInactive);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load branches';
    } finally {
      this._loading = false;
    }
  }

  private _openCreate() {
    this._form = { ...EMPTY_FORM };
    this._editorOpen = true;
  }

  private _openEdit(b: Location) {
    this._form = {
      id: b.id,
      code: b.code,
      name: b.name ?? '',
      description: b.description ?? '',
      address: b.address ?? '',
      city: b.city ?? '',
      state: b.state ?? '',
      zip: b.zip ?? '',
      phone: b.phone ?? '',
      timezone: b.timezone ?? 'America/New_York',
      active: b.active ?? true,
    };
    this._editorOpen = true;
  }

  private _closeEditor() {
    if (this._saving) return;
    this._editorOpen = false;
  }

  private _updateField<K extends keyof BranchForm>(key: K, value: BranchForm[K]) {
    this._form = { ...this._form, [key]: value };
  }

  private async _save() {
    if (!this._form.code.trim() || !this._form.name.trim()) {
      ToastService.show('Code and name are required', 'error');
      return;
    }
    this._saving = true;
    try {
      const payload = {
        code: this._form.code.trim(),
        name: this._form.name.trim(),
        description: this._form.description?.trim() || undefined,
        address: this._form.address?.trim() || undefined,
        city: this._form.city?.trim() || undefined,
        state: this._form.state?.trim() || undefined,
        zip: this._form.zip?.trim() || undefined,
        phone: this._form.phone?.trim() || undefined,
        timezone: this._form.timezone?.trim() || undefined,
        active: this._form.active,
      };
      if (this._form.id) {
        await LocationService.updateBranch(this._form.id, payload);
        ToastService.show('Branch updated', 'success');
      } else {
        await LocationService.createBranch(payload);
        ToastService.show('Branch created', 'success');
      }
      this._editorOpen = false;
      await this._load();
      // Refresh the switcher so the new branch appears immediately.
      await branchContext.refresh();
    } catch (err) {
      ToastService.show(
        err instanceof Error ? err.message : 'Failed to save branch',
        'error',
      );
    } finally {
      this._saving = false;
    }
  }

  private async _archive(b: Location) {
    if (b.active === false) return;
    try {
      await LocationService.archiveBranch(b.id);
      ToastService.show(`Archived ${b.code}`, 'success');
      await this._load();
      await branchContext.refresh();
    } catch (err) {
      ToastService.show(
        err instanceof Error ? err.message : 'Failed to archive branch',
        'error',
      );
    }
  }

  private async _toggleInactive() {
    this._showInactive = !this._showInactive;
    await this._load();
  }

  private _openUsers(b: Location) {
    router.navigate(`/admin/branches/${b.id}/users`);
  }

  render() {
    return html`
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-white flex items-center gap-3">
              <span class="text-gable-green">${icon(Building2, 24)}</span>
              Branches
            </h1>
            <p class="text-sm text-zinc-500 mt-1">Manage physical branch locations and access</p>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-xs text-zinc-400 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                .checked=${this._showInactive}
                @change=${() => this._toggleInactive()}
                class="rounded bg-slate-steel border-white/10 text-gable-green focus:ring-gable-green/30"
              />
              Show archived
            </label>
            <button
              @click=${() => this._openCreate()}
              class="flex items-center gap-2 px-4 py-2 bg-gable-green text-deep-space rounded-lg text-sm font-semibold hover:bg-gable-green/90 transition-colors shadow-glow"
            >
              ${icon(Plus, 16)} New Branch
            </button>
          </div>
        </div>

        ${this._error ? html`
          <div class="bg-safety-red/10 border border-safety-red/30 text-safety-red text-sm px-4 py-3 rounded-lg">
            ${this._error}
          </div>
        ` : nothing}

        <div class="bg-slate-steel border border-white/5 rounded-xl overflow-hidden">
          ${this._loading ? html`
            <div class="p-12 text-center text-zinc-500 text-sm">Loading...</div>
          ` : this._branches.length === 0 ? html`
            <div class="p-12 text-center text-zinc-500 text-sm">No branches yet. Create one to get started.</div>
          ` : html`
            <table class="w-full text-sm">
              <thead class="bg-deep-space/40 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th class="text-left px-4 py-3 font-semibold">Code</th>
                  <th class="text-left px-4 py-3 font-semibold">Name</th>
                  <th class="text-left px-4 py-3 font-semibold">Location</th>
                  <th class="text-left px-4 py-3 font-semibold">Timezone</th>
                  <th class="text-left px-4 py-3 font-semibold">Status</th>
                  <th class="text-right px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${this._branches.map((b) => html`
                  <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-4 py-3 font-mono text-gable-green">${b.code}</td>
                    <td class="px-4 py-3 text-white font-medium">${b.name || '—'}</td>
                    <td class="px-4 py-3 text-zinc-400">
                      ${[b.city, b.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td class="px-4 py-3 text-zinc-400 font-mono text-xs">${b.timezone || '—'}</td>
                    <td class="px-4 py-3">
                      ${b.active === false
                        ? html`<span class="text-xs px-2 py-0.5 rounded-full bg-zinc-700/40 text-zinc-400">Archived</span>`
                        : html`<span class="text-xs px-2 py-0.5 rounded-full bg-gable-green/15 text-gable-green">Active</span>`}
                    </td>
                    <td class="px-4 py-3 text-right">
                      <div class="inline-flex items-center gap-1">
                        <button
                          @click=${() => this._openUsers(b)}
                          title="Manage users"
                          class="p-1.5 rounded hover:bg-white/5 text-zinc-400 hover:text-blueprint-blue transition-colors"
                        >${icon(Users, 14)}</button>
                        <button
                          @click=${() => this._openEdit(b)}
                          title="Edit"
                          class="p-1.5 rounded hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                        >${icon(Pencil, 14)}</button>
                        ${b.active !== false ? html`
                          <button
                            @click=${() => this._archive(b)}
                            title="Archive"
                            class="p-1.5 rounded hover:bg-white/5 text-zinc-400 hover:text-safety-red transition-colors"
                          >${icon(Archive, 14)}</button>
                        ` : nothing}
                      </div>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
        </div>

        ${this._editorOpen ? this._renderEditor() : nothing}
      </div>
    `;
  }

  private _renderEditor() {
    const isEdit = !!this._form.id;
    return html`
      <div
        class="fixed inset-0 z-50 bg-deep-space/80 backdrop-blur-sm flex items-center justify-center p-4"
        @click=${() => this._closeEditor()}
      >
        <div
          class="bg-slate-steel border border-white/10 rounded-xl w-full max-w-2xl shadow-elevation-2 max-h-[90vh] overflow-y-auto"
          @click=${(e: MouseEvent) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between px-6 py-4 border-b border-white/5">
            <h2 class="text-lg font-semibold text-white">
              ${isEdit ? 'Edit Branch' : 'New Branch'}
            </h2>
            <button
              @click=${() => this._closeEditor()}
              class="p-1 rounded hover:bg-white/5 text-zinc-400 hover:text-white"
            >${icon(X, 16)}</button>
          </div>

          <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            ${this._textField('Code *', 'code', 'WEST', !isEdit)}
            ${this._textField('Name *', 'name', 'West Yard')}
            <div class="md:col-span-2">${this._textField('Description', 'description', '')}</div>
            <div class="md:col-span-2">${this._textField('Address', 'address', '123 Main St')}</div>
            ${this._textField('City', 'city', '')}
            ${this._textField('State', 'state', 'CT')}
            ${this._textField('ZIP', 'zip', '')}
            ${this._textField('Phone', 'phone', '')}
            <div class="md:col-span-2">${this._textField('Timezone', 'timezone', 'America/New_York')}</div>
            <label class="flex items-center gap-2 text-sm text-zinc-300 md:col-span-2">
              <input
                type="checkbox"
                .checked=${this._form.active}
                @change=${(e: Event) => this._updateField('active', (e.target as HTMLInputElement).checked)}
                class="rounded bg-slate-steel border-white/10 text-gable-green focus:ring-gable-green/30"
              />
              Active
            </label>
          </div>

          <div class="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-3">
            <button
              @click=${() => this._closeEditor()}
              ?disabled=${this._saving}
              class="px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 rounded-lg transition-colors"
            >Cancel</button>
            <button
              @click=${() => this._save()}
              ?disabled=${this._saving}
              class="px-4 py-2 text-sm font-semibold bg-gable-green text-deep-space rounded-lg hover:bg-gable-green/90 transition-colors disabled:opacity-50"
            >${this._saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create branch'}</button>
          </div>
        </div>
      </div>
    `;
  }

  private _textField(
    label: string,
    key: keyof BranchForm,
    placeholder: string,
    enabled = true,
  ) {
    const value = (this._form[key] ?? '') as string;
    return html`
      <label class="block text-xs uppercase tracking-wider text-zinc-500 font-semibold">
        ${label}
        <input
          type="text"
          .value=${value}
          ?disabled=${!enabled}
          placeholder=${placeholder}
          @input=${(e: Event) => this._updateField(key, (e.target as HTMLInputElement).value as never)}
          class="mt-1 w-full bg-deep-space/60 border border-white/10 rounded-md px-3 py-2 text-sm text-white font-normal normal-case tracking-normal focus:outline-none focus:border-gable-green/50 disabled:opacity-50"
        />
      </label>
    `;
  }
}
