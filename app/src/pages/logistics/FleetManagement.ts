import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { Truck, Users, Plus, Pencil, Trash2, AlertTriangle, RefreshCw, X, Upload } from 'lucide';
import { deliveryService } from '../../services/deliveryService';
import { ToastService } from '../../lib/toast-service.ts';
import type { Vehicle, Driver, CreateVehicleRequest, UpdateVehicleRequest, CreateDriverRequest, UpdateDriverRequest, VehicleType, DriverStatus } from '../../types/delivery';

type Tab = 'vehicles' | 'drivers';

const VEHICLE_TYPES: VehicleType[] = ['BOX_TRUCK', 'FLATBED', 'PICKUP', 'VAN', 'CRANE'];
const DRIVER_STATUSES: DriverStatus[] = ['ACTIVE', 'INACTIVE', 'ON_LEAVE'];
const CDL_CLASSES = ['', 'A', 'B', 'C'];

function isDateWarning(dateStr?: string, daysThreshold = 30): 'expired' | 'warning' | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  if (d < now) return 'expired';
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff <= daysThreshold) return 'warning';
  return null;
}

function dateBadgeClass(level: 'expired' | 'warning' | null): string {
  if (level === 'expired') return 'text-red-400';
  if (level === 'warning') return 'text-amber-400';
  return 'text-zinc-300';
}

function formatDate(d?: string): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString();
}

@customElement('gable-fleet-management')
export class FleetManagement extends LitElement {
  createRenderRoot() { return this; }

  @state() private _tab: Tab = 'vehicles';
  @state() private _vehicles: Vehicle[] = [];
  @state() private _drivers: Driver[] = [];
  @state() private _loading = true;
  @state() private _error = '';

  // Vehicle modal
  @state() private _vehicleModalOpen = false;
  @state() private _vehicleModalVehicle: Vehicle | undefined = undefined;

  // Driver modal
  @state() private _driverModalOpen = false;
  @state() private _driverModalDriver: Driver | undefined = undefined;

  connectedCallback() {
    super.connectedCallback();
    this._fetchData();
  }

  private async _fetchData() {
    this._loading = true;
    this._error = '';
    try {
      const [v, d] = await Promise.all([deliveryService.listVehicles(), deliveryService.listDrivers()]);
      this._vehicles = v || [];
      this._drivers = d || [];
    } catch (e) {
      this._error = e instanceof Error ? e.message : 'Failed to load fleet data';
    } finally {
      this._loading = false;
    }
  }

  private _openVehicleModal(vehicle?: Vehicle) {
    this._vehicleModalVehicle = vehicle;
    this._vehicleModalOpen = true;
  }

  private _closeVehicleModal() {
    this._vehicleModalOpen = false;
    this._vehicleModalVehicle = undefined;
  }

  private _openDriverModal(driver?: Driver) {
    this._driverModalDriver = driver;
    this._driverModalOpen = true;
  }

  private _closeDriverModal() {
    this._driverModalOpen = false;
    this._driverModalDriver = undefined;
  }

  private _onSaved() {
    this._fetchData();
  }

  /* ---- Vehicle Modal State ---- */
  @state() private _vForm: CreateVehicleRequest & { id?: string } = this._defaultVehicleForm();
  @state() private _vSaving = false;
  @state() private _vDeleting = false;
  @state() private _vPhotoUrl: string | undefined = undefined;
  @state() private _vUploading = false;

  private _defaultVehicleForm(vehicle?: Vehicle): CreateVehicleRequest & { id?: string } {
    return {
      name: vehicle?.name || '',
      vehicle_type: vehicle?.vehicle_type || 'BOX_TRUCK',
      license_plate: vehicle?.license_plate || '',
      capacity_weight_lbs: vehicle?.capacity_weight_lbs,
      vin: vehicle?.vin || undefined,
      year: vehicle?.year || undefined,
      make: vehicle?.make || undefined,
      model: vehicle?.model || undefined,
      insurance_expiry: vehicle?.insurance_expiry?.split('T')[0] || undefined,
      next_service_date: vehicle?.next_service_date?.split('T')[0] || undefined,
      odometer_miles: vehicle?.odometer_miles || undefined,
      notes: vehicle?.notes || undefined,
    };
  }

  private _initVehicleModal() {
    this._vForm = this._defaultVehicleForm(this._vehicleModalVehicle);
    this._vSaving = false;
    this._vDeleting = false;
    this._vPhotoUrl = this._vehicleModalVehicle?.photo_url;
    this._vUploading = false;
  }

  private async _handleVehicleSave() {
    this._vSaving = true;
    try {
      if (this._vehicleModalVehicle) {
        await deliveryService.updateVehicle(this._vehicleModalVehicle.id, this._vForm as UpdateVehicleRequest);
      } else {
        await deliveryService.createVehicle(this._vForm);
      }
      this._onSaved();
      this._closeVehicleModal();
    } catch { ToastService.error('Failed to save vehicle'); } finally { this._vSaving = false; }
  }

  private async _handleVehicleDelete() {
    if (!this._vehicleModalVehicle || !confirm('Delete this vehicle? This action cannot be undone.')) return;
    this._vDeleting = true;
    try {
      await deliveryService.deleteVehicle(this._vehicleModalVehicle.id);
      this._onSaved();
      this._closeVehicleModal();
    } catch { ToastService.error('Failed to delete vehicle'); } finally { this._vDeleting = false; }
  }

  private async _handleVehiclePhoto(file: File) {
    if (!this._vehicleModalVehicle) return;
    this._vUploading = true;
    try {
      const url = await deliveryService.uploadVehiclePhoto(this._vehicleModalVehicle.id, file);
      this._vPhotoUrl = url;
      this._onSaved();
    } catch { ToastService.error('Failed to upload photo'); } finally { this._vUploading = false; }
  }

  /* ---- Driver Modal State ---- */
  @state() private _dForm: {
    name: string;
    license_number?: string;
    phone_number?: string;
    status: DriverStatus;
    cdl_class?: string;
    cdl_expiry?: string;
    hire_date?: string;
    email?: string;
  } = this._defaultDriverForm();
  @state() private _dSaving = false;
  @state() private _dDeleting = false;
  @state() private _dPhotoUrl: string | undefined = undefined;
  @state() private _dUploading = false;

  private _defaultDriverForm(driver?: Driver) {
    return {
      name: driver?.name || '',
      license_number: driver?.license_number || undefined,
      phone_number: driver?.phone_number || undefined,
      status: (driver?.status || 'ACTIVE') as DriverStatus,
      cdl_class: driver?.cdl_class || undefined,
      cdl_expiry: driver?.cdl_expiry?.split('T')[0] || undefined,
      hire_date: driver?.hire_date?.split('T')[0] || undefined,
      email: driver?.email || undefined,
    };
  }

  private _initDriverModal() {
    this._dForm = this._defaultDriverForm(this._driverModalDriver);
    this._dSaving = false;
    this._dDeleting = false;
    this._dPhotoUrl = this._driverModalDriver?.photo_url;
    this._dUploading = false;
  }

  private async _handleDriverSave() {
    this._dSaving = true;
    try {
      if (this._driverModalDriver) {
        await deliveryService.updateDriver(this._driverModalDriver.id, this._dForm as UpdateDriverRequest);
      } else {
        await deliveryService.createDriver(this._dForm as CreateDriverRequest);
      }
      this._onSaved();
      this._closeDriverModal();
    } catch { ToastService.error('Failed to save driver'); } finally { this._dSaving = false; }
  }

  private async _handleDriverDelete() {
    if (!this._driverModalDriver || !confirm('Remove this driver? This action cannot be undone.')) return;
    this._dDeleting = true;
    try {
      await deliveryService.deleteDriver(this._driverModalDriver.id);
      this._onSaved();
      this._closeDriverModal();
    } catch { ToastService.error('Failed to delete driver'); } finally { this._dDeleting = false; }
  }

  private async _handleDriverPhoto(file: File) {
    if (!this._driverModalDriver) return;
    this._dUploading = true;
    try {
      const url = await deliveryService.uploadDriverPhoto(this._driverModalDriver.id, file);
      this._dPhotoUrl = url;
      this._onSaved();
    } catch { ToastService.error('Failed to upload photo'); } finally { this._dUploading = false; }
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('_vehicleModalOpen') && this._vehicleModalOpen) {
      this._initVehicleModal();
    }
    if (changed.has('_driverModalOpen') && this._driverModalOpen) {
      this._initDriverModal();
    }
  }

  render() {
    const statusColors: Record<string, string> = {
      ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      INACTIVE: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
      ON_LEAVE: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };

    return html`
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-display-large text-white flex items-center gap-3">
              ${icon(Truck, 40, 'text-gable-green')}
              Fleet Management
            </h1>
            <p class="text-zinc-500 mt-1 text-lg">Manage vehicles, drivers, and fleet compliance.</p>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 bg-white/5 rounded-lg p-1 w-fit border border-white/10">
          <button
            @click=${() => { this._tab = 'vehicles'; }}
            class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${this._tab === 'vehicles' ? 'bg-gable-green/10 text-gable-green border border-gable-green/20' : 'text-zinc-400 hover:text-white'}"
          >
            ${icon(Truck, 16)} Vehicles (${this._vehicles.length})
          </button>
          <button
            @click=${() => { this._tab = 'drivers'; }}
            class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${this._tab === 'drivers' ? 'bg-gable-green/10 text-gable-green border border-gable-green/20' : 'text-zinc-400 hover:text-white'}"
          >
            ${icon(Users, 16)} Drivers (${this._drivers.length})
          </button>
        </div>

        ${this._error ? html`
          <div class="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            ${icon(AlertTriangle, 18, 'text-red-400')}
            <span class="text-red-300 text-sm">${this._error}</span>
            <button @click=${() => this._fetchData()} class="ml-auto text-zinc-400 hover:text-white">${icon(RefreshCw, 16)}</button>
          </div>
        ` : nothing}

        ${this._loading ? html`
          <div class="space-y-3">
            ${[1,2,3].map(() => html`<div class="h-16 bg-white/5 rounded-xl animate-pulse"></div>`)}
          </div>
        ` : this._tab === 'vehicles' ? this._renderVehiclesTab() : this._renderDriversTab(statusColors)}
      </div>

      ${this._vehicleModalOpen ? this._renderVehicleModal() : nothing}
      ${this._driverModalOpen ? this._renderDriverModal(statusColors) : nothing}
    `;
  }

  /* ---- Vehicles Tab ---- */
  private _renderVehiclesTab() {
    return html`
      <div class="rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
        <div class="p-0">
          <div class="flex items-center justify-between p-4 border-b border-white/5">
            <span class="text-white font-semibold">Fleet Vehicles</span>
            <button @click=${() => this._openVehicleModal()} class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gable-green/10 text-gable-green border border-gable-green/20 text-sm font-medium hover:bg-gable-green/20 transition-colors">
              ${icon(Plus, 14)} Add Vehicle
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-zinc-500 text-xs uppercase tracking-wider border-b border-white/5">
                  <th class="px-4 py-3 w-12"></th>
                  <th class="px-4 py-3">Name</th>
                  <th class="px-4 py-3">Type</th>
                  <th class="px-4 py-3">Plate</th>
                  <th class="px-4 py-3">VIN</th>
                  <th class="px-4 py-3">Year / Make / Model</th>
                  <th class="px-4 py-3 text-right">Capacity</th>
                  <th class="px-4 py-3 text-right">Odometer</th>
                  <th class="px-4 py-3">Insurance Exp</th>
                  <th class="px-4 py-3">Next Service</th>
                  <th class="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                ${this._vehicles.map(v => {
                  const insWarn = isDateWarning(v.insurance_expiry);
                  const svcWarn = isDateWarning(v.next_service_date);
                  return html`
                    <tr class="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" @click=${() => this._openVehicleModal(v)}>
                      <td class="px-4 py-3">
                        ${v.photo_url ? html`
                          <img src="${v.photo_url}" alt="${v.name}" class="w-9 h-9 rounded-lg object-cover border border-white/10" />
                        ` : html`
                          <div class="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">${icon(Truck, 14, 'text-zinc-600')}</div>
                        `}
                      </td>
                      <td class="px-4 py-3 text-white font-medium">${v.name}</td>
                      <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">${v.vehicle_type.replace(/_/g, ' ')}</span></td>
                      <td class="px-4 py-3 font-mono text-zinc-300">${v.license_plate}</td>
                      <td class="px-4 py-3 font-mono text-zinc-400 text-xs">${v.vin || '\u2014'}</td>
                      <td class="px-4 py-3 text-zinc-300">${[v.year, v.make, v.model].filter(Boolean).join(' ') || '\u2014'}</td>
                      <td class="px-4 py-3 text-right font-mono text-zinc-300">${v.capacity_weight_lbs ? `${v.capacity_weight_lbs.toLocaleString()} lbs` : '\u2014'}</td>
                      <td class="px-4 py-3 text-right font-mono text-zinc-300">${v.odometer_miles ? `${v.odometer_miles.toLocaleString()} mi` : '\u2014'}</td>
                      <td class="px-4 py-3 font-mono text-xs ${dateBadgeClass(insWarn)}">
                        ${insWarn === 'expired' ? icon(AlertTriangle, 12, 'inline mr-1') : nothing}
                        ${formatDate(v.insurance_expiry)}
                      </td>
                      <td class="px-4 py-3 font-mono text-xs ${dateBadgeClass(svcWarn)}">
                        ${svcWarn === 'expired' ? icon(AlertTriangle, 12, 'inline mr-1') : nothing}
                        ${formatDate(v.next_service_date)}
                      </td>
                      <td class="px-4 py-3">${icon(Pencil, 14, 'text-zinc-500')}</td>
                    </tr>
                  `;
                })}
                ${this._vehicles.length === 0 ? html`
                  <tr><td colspan="11" class="px-4 py-12 text-center text-zinc-500">No vehicles configured. Add your first vehicle to get started.</td></tr>
                ` : nothing}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  /* ---- Drivers Tab ---- */
  private _renderDriversTab(statusColors: Record<string, string>) {
    return html`
      <div class="rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
        <div class="p-0">
          <div class="flex items-center justify-between p-4 border-b border-white/5">
            <span class="text-white font-semibold">Drivers</span>
            <button @click=${() => this._openDriverModal()} class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gable-green/10 text-gable-green border border-gable-green/20 text-sm font-medium hover:bg-gable-green/20 transition-colors">
              ${icon(Plus, 14)} Add Driver
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-zinc-500 text-xs uppercase tracking-wider border-b border-white/5">
                  <th class="px-4 py-3 w-12"></th>
                  <th class="px-4 py-3">Name</th>
                  <th class="px-4 py-3">Phone</th>
                  <th class="px-4 py-3">Email</th>
                  <th class="px-4 py-3">License #</th>
                  <th class="px-4 py-3">CDL</th>
                  <th class="px-4 py-3">CDL Expiry</th>
                  <th class="px-4 py-3">Hire Date</th>
                  <th class="px-4 py-3">Status</th>
                  <th class="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                ${this._drivers.map(d => {
                  const cdlWarn = isDateWarning(d.cdl_expiry, 60);
                  return html`
                    <tr class="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" @click=${() => this._openDriverModal(d)}>
                      <td class="px-4 py-3">
                        ${d.photo_url ? html`
                          <img src="${d.photo_url}" alt="${d.name}" class="w-9 h-9 rounded-full object-cover border border-white/10" />
                        ` : html`
                          <div class="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">${icon(Users, 14, 'text-zinc-600')}</div>
                        `}
                      </td>
                      <td class="px-4 py-3 text-white font-medium">${d.name}</td>
                      <td class="px-4 py-3 font-mono text-zinc-300">${d.phone_number || '\u2014'}</td>
                      <td class="px-4 py-3 text-zinc-300">${d.email || '\u2014'}</td>
                      <td class="px-4 py-3 font-mono text-zinc-400 text-xs">${d.license_number || '\u2014'}</td>
                      <td class="px-4 py-3 text-zinc-300">${d.cdl_class || '\u2014'}</td>
                      <td class="px-4 py-3 font-mono text-xs ${dateBadgeClass(cdlWarn)}">
                        ${cdlWarn === 'expired' ? icon(AlertTriangle, 12, 'inline mr-1') : nothing}
                        ${formatDate(d.cdl_expiry)}
                      </td>
                      <td class="px-4 py-3 font-mono text-xs text-zinc-300">${formatDate(d.hire_date)}</td>
                      <td class="px-4 py-3">
                        <span class="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${statusColors[d.status] || statusColors.ACTIVE}">
                          ${d.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td class="px-4 py-3">${icon(Pencil, 14, 'text-zinc-500')}</td>
                    </tr>
                  `;
                })}
                ${this._drivers.length === 0 ? html`
                  <tr><td colspan="10" class="px-4 py-12 text-center text-zinc-500">No drivers configured. Add your first driver to get started.</td></tr>
                ` : nothing}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  /* ---- Photo Uploader helper ---- */
  private _renderPhotoUploader(currentUrl: string | undefined, uploading: boolean, onSelect: (file: File) => void, shape: string, placeholderIcon: Parameters<typeof icon>[0]) {
    return html`
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 ${shape} overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
          ${currentUrl ? html`
            <img src="${currentUrl}" alt="Photo" class="w-full h-full object-cover" />
          ` : icon(placeholderIcon, 24, 'text-zinc-600')}
        </div>
        <label class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-zinc-300 hover:bg-white/10 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}">
          ${icon(Upload, 14)}
          ${uploading ? 'Uploading...' : currentUrl ? 'Change Photo' : 'Upload Photo'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden"
            @change=${(e: Event) => {
              const input = e.target as HTMLInputElement;
              const file = input.files?.[0];
              if (file) onSelect(file);
            }}
          />
        </label>
      </div>
    `;
  }

  /* ---- Vehicle Modal ---- */
  private _renderVehicleModal() {
    const isEdit = !!this._vehicleModalVehicle;

    return html`
      <div class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" @click=${() => this._closeVehicleModal()}>
        <div class="bg-slate-steel border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl" @click=${(e: Event) => e.stopPropagation()}>
          <div class="flex items-center justify-between p-5 border-b border-white/5">
            <h2 class="text-lg font-semibold text-white">${isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
            <button @click=${() => this._closeVehicleModal()} class="p-1 rounded hover:bg-white/10 text-zinc-400">${icon(X, 18)}</button>
          </div>
          <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            ${isEdit ? this._renderPhotoUploader(this._vPhotoUrl, this._vUploading, (f) => this._handleVehiclePhoto(f), 'rounded-lg', Truck) : nothing}
            <div class="grid grid-cols-2 gap-4">
              ${this._renderField('Name', this._vForm.name, (v: string) => { this._vForm = { ...this._vForm, name: v }; }, true)}
              <div>
                <label class="block text-xs text-zinc-500 mb-1">Type</label>
                <select
                  .value=${this._vForm.vehicle_type}
                  @change=${(e: Event) => { this._vForm = { ...this._vForm, vehicle_type: (e.target as HTMLSelectElement).value as VehicleType }; }}
                  class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  ${VEHICLE_TYPES.map(t => html`<option value="${t}" ?selected=${this._vForm.vehicle_type === t}>${t.replace(/_/g, ' ')}</option>`)}
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              ${this._renderField('License Plate', this._vForm.license_plate, (v: string) => { this._vForm = { ...this._vForm, license_plate: v }; }, true)}
              ${this._renderField('VIN', this._vForm.vin || '', (v: string) => { this._vForm = { ...this._vForm, vin: v || undefined }; })}
            </div>
            <div class="grid grid-cols-3 gap-4">
              ${this._renderNumField('Year', this._vForm.year, (v?: number) => { this._vForm = { ...this._vForm, year: v }; })}
              ${this._renderField('Make', this._vForm.make || '', (v: string) => { this._vForm = { ...this._vForm, make: v || undefined }; })}
              ${this._renderField('Model', this._vForm.model || '', (v: string) => { this._vForm = { ...this._vForm, model: v || undefined }; })}
            </div>
            <div class="grid grid-cols-2 gap-4">
              ${this._renderNumField('Capacity (lbs)', this._vForm.capacity_weight_lbs, (v?: number) => { this._vForm = { ...this._vForm, capacity_weight_lbs: v }; })}
              ${this._renderNumField('Odometer (mi)', this._vForm.odometer_miles, (v?: number) => { this._vForm = { ...this._vForm, odometer_miles: v }; })}
            </div>
            <div class="grid grid-cols-2 gap-4">
              ${this._renderDateField('Insurance Expiry', this._vForm.insurance_expiry || '', (v: string) => { this._vForm = { ...this._vForm, insurance_expiry: v || undefined }; })}
              ${this._renderDateField('Next Service', this._vForm.next_service_date || '', (v: string) => { this._vForm = { ...this._vForm, next_service_date: v || undefined }; })}
            </div>
            <div>
              <label class="block text-xs text-zinc-500 mb-1">Notes</label>
              <textarea
                .value=${this._vForm.notes || ''}
                @input=${(e: Event) => { this._vForm = { ...this._vForm, notes: (e.target as HTMLTextAreaElement).value || undefined }; }}
                rows="2"
                class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none"
              ></textarea>
            </div>
          </div>
          <div class="flex items-center justify-between p-5 border-t border-white/5">
            ${isEdit ? html`
              <button @click=${() => this._handleVehicleDelete()} ?disabled=${this._vDeleting} class="flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 text-sm transition-colors">
                ${icon(Trash2, 14)} ${this._vDeleting ? 'Deleting...' : 'Delete'}
              </button>
            ` : html`<div></div>`}
            <div class="flex gap-2">
              <button @click=${() => this._closeVehicleModal()} class="px-4 py-2 rounded-lg text-zinc-400 hover:text-white text-sm transition-colors">Cancel</button>
              <button
                @click=${() => this._handleVehicleSave()}
                ?disabled=${this._vSaving || !this._vForm.name || !this._vForm.license_plate}
                class="px-4 py-2 rounded-lg bg-gable-green text-black text-sm font-semibold hover:bg-gable-green/90 disabled:opacity-50 transition-colors"
              >
                ${this._vSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Vehicle'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ---- Driver Modal ---- */
  private _renderDriverModal(_statusColors: Record<string, string>) {
    const isEdit = !!this._driverModalDriver;

    return html`
      <div class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" @click=${() => this._closeDriverModal()}>
        <div class="bg-slate-steel border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl" @click=${(e: Event) => e.stopPropagation()}>
          <div class="flex items-center justify-between p-5 border-b border-white/5">
            <h2 class="text-lg font-semibold text-white">${isEdit ? 'Edit Driver' : 'Add Driver'}</h2>
            <button @click=${() => this._closeDriverModal()} class="p-1 rounded hover:bg-white/10 text-zinc-400">${icon(X, 18)}</button>
          </div>
          <div class="p-5 space-y-4">
            ${isEdit ? this._renderPhotoUploader(this._dPhotoUrl, this._dUploading, (f) => this._handleDriverPhoto(f), 'rounded-full', Users) : nothing}
            <div class="grid grid-cols-2 gap-4">
              ${this._renderField('Name', this._dForm.name, (v: string) => { this._dForm = { ...this._dForm, name: v }; }, true)}
              ${this._renderField('Email', this._dForm.email || '', (v: string) => { this._dForm = { ...this._dForm, email: v || undefined }; })}
            </div>
            <div class="grid grid-cols-2 gap-4">
              ${this._renderField('Phone', this._dForm.phone_number || '', (v: string) => { this._dForm = { ...this._dForm, phone_number: v || undefined }; })}
              ${this._renderField('License #', this._dForm.license_number || '', (v: string) => { this._dForm = { ...this._dForm, license_number: v || undefined }; })}
            </div>
            <div class="grid grid-cols-3 gap-4">
              <div>
                <label class="block text-xs text-zinc-500 mb-1">CDL Class</label>
                <select
                  .value=${this._dForm.cdl_class || ''}
                  @change=${(e: Event) => { this._dForm = { ...this._dForm, cdl_class: (e.target as HTMLSelectElement).value || undefined }; }}
                  class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  ${CDL_CLASSES.map(c => html`<option value="${c}" ?selected=${(this._dForm.cdl_class || '') === c}>${c || 'None'}</option>`)}
                </select>
              </div>
              ${this._renderDateField('CDL Expiry', this._dForm.cdl_expiry || '', (v: string) => { this._dForm = { ...this._dForm, cdl_expiry: v || undefined }; })}
              ${this._renderDateField('Hire Date', this._dForm.hire_date || '', (v: string) => { this._dForm = { ...this._dForm, hire_date: v || undefined }; })}
            </div>
            ${isEdit ? html`
              <div>
                <label class="block text-xs text-zinc-500 mb-1">Status</label>
                <select
                  .value=${this._dForm.status}
                  @change=${(e: Event) => { this._dForm = { ...this._dForm, status: (e.target as HTMLSelectElement).value as DriverStatus }; }}
                  class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  ${DRIVER_STATUSES.map(s => html`<option value="${s}" ?selected=${this._dForm.status === s}>${s.replace(/_/g, ' ')}</option>`)}
                </select>
              </div>
            ` : nothing}
          </div>
          <div class="flex items-center justify-between p-5 border-t border-white/5">
            ${isEdit ? html`
              <button @click=${() => this._handleDriverDelete()} ?disabled=${this._dDeleting} class="flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 text-sm transition-colors">
                ${icon(Trash2, 14)} ${this._dDeleting ? 'Removing...' : 'Remove'}
              </button>
            ` : html`<div></div>`}
            <div class="flex gap-2">
              <button @click=${() => this._closeDriverModal()} class="px-4 py-2 rounded-lg text-zinc-400 hover:text-white text-sm transition-colors">Cancel</button>
              <button
                @click=${() => this._handleDriverSave()}
                ?disabled=${this._dSaving || !this._dForm.name}
                class="px-4 py-2 rounded-lg bg-gable-green text-black text-sm font-semibold hover:bg-gable-green/90 disabled:opacity-50 transition-colors"
              >
                ${this._dSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Driver'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ---- Shared Form Field Helpers ---- */
  private _renderField(label: string, value: string, onChange: (v: string) => void, required?: boolean) {
    return html`
      <div>
        <label class="block text-xs text-zinc-500 mb-1">${label}${required ? ' *' : ''}</label>
        <input type="text" .value=${value} @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)} class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50" />
      </div>
    `;
  }

  private _renderNumField(label: string, value: number | undefined, onChange: (v?: number) => void) {
    return html`
      <div>
        <label class="block text-xs text-zinc-500 mb-1">${label}</label>
        <input type="number" .value=${value ?? ''} @input=${(e: Event) => { const v = (e.target as HTMLInputElement).value; onChange(v ? Number(v) : undefined); }} class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50" />
      </div>
    `;
  }

  private _renderDateField(label: string, value: string, onChange: (v: string) => void) {
    return html`
      <div>
        <label class="block text-xs text-zinc-500 mb-1">${label}</label>
        <input type="date" .value=${value} @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)} class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50" />
      </div>
    `;
  }
}
