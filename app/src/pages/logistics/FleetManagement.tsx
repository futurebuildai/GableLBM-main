import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../../components/ui/Card';
import { PageTransition } from '../../components/ui/PageTransition';
import { Truck, Users, Plus, Pencil, Trash2, AlertTriangle, RefreshCw, X, Upload } from 'lucide-react';
import { deliveryService } from '../../services/deliveryService';
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
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
}

export const FleetManagement = () => {
    const [tab, setTab] = useState<Tab>('vehicles');
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Vehicle modal
    const [vehicleModal, setVehicleModal] = useState<{ open: boolean; vehicle?: Vehicle }>({ open: false });
    // Driver modal
    const [driverModal, setDriverModal] = useState<{ open: boolean; driver?: Driver }>({ open: false });

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [v, d] = await Promise.all([deliveryService.listVehicles(), deliveryService.listDrivers()]);
            setVehicles(v || []);
            setDrivers(d || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load fleet data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    return (
        <PageTransition>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-display-large text-white flex items-center gap-3">
                            <Truck className="w-10 h-10 text-gable-green" />
                            Fleet Management
                        </h1>
                        <p className="text-zinc-500 mt-1 text-lg">Manage vehicles, drivers, and fleet compliance.</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit border border-white/10">
                    <button
                        onClick={() => setTab('vehicles')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === 'vehicles' ? 'bg-gable-green/10 text-gable-green border border-gable-green/20' : 'text-zinc-400 hover:text-white'}`}
                    >
                        <Truck size={16} /> Vehicles ({vehicles.length})
                    </button>
                    <button
                        onClick={() => setTab('drivers')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === 'drivers' ? 'bg-gable-green/10 text-gable-green border border-gable-green/20' : 'text-zinc-400 hover:text-white'}`}
                    >
                        <Users size={16} /> Drivers ({drivers.length})
                    </button>
                </div>

                {error && (
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                        <AlertTriangle className="text-red-400" size={18} />
                        <span className="text-red-300 text-sm">{error}</span>
                        <button onClick={fetchData} className="ml-auto text-zinc-400 hover:text-white"><RefreshCw size={16} /></button>
                    </div>
                )}

                {loading ? (
                    <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>
                ) : tab === 'vehicles' ? (
                    <VehiclesTab vehicles={vehicles} onEdit={v => setVehicleModal({ open: true, vehicle: v })} onAdd={() => setVehicleModal({ open: true })} />
                ) : (
                    <DriversTab drivers={drivers} onEdit={d => setDriverModal({ open: true, driver: d })} onAdd={() => setDriverModal({ open: true })} />
                )}
            </div>

            {vehicleModal.open && (
                <VehicleModal vehicle={vehicleModal.vehicle} onClose={() => setVehicleModal({ open: false })} onSaved={fetchData} />
            )}
            {driverModal.open && (
                <DriverModal driver={driverModal.driver} onClose={() => setDriverModal({ open: false })} onSaved={fetchData} />
            )}
        </PageTransition>
    );
};

/* ─── Vehicles Tab ──────────────────────────────────────────────── */

function VehiclesTab({ vehicles, onEdit, onAdd }: { vehicles: Vehicle[]; onEdit: (v: Vehicle) => void; onAdd: () => void }) {
    return (
        <Card variant="glass">
            <CardContent className="p-0">
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                    <span className="text-white font-semibold">Fleet Vehicles</span>
                    <button onClick={onAdd} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gable-green/10 text-gable-green border border-gable-green/20 text-sm font-medium hover:bg-gable-green/20 transition-colors">
                        <Plus size={14} /> Add Vehicle
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-zinc-500 text-xs uppercase tracking-wider border-b border-white/5">
                                <th className="px-4 py-3 w-12"></th>
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Plate</th>
                                <th className="px-4 py-3">VIN</th>
                                <th className="px-4 py-3">Year / Make / Model</th>
                                <th className="px-4 py-3 text-right">Capacity</th>
                                <th className="px-4 py-3 text-right">Odometer</th>
                                <th className="px-4 py-3">Insurance Exp</th>
                                <th className="px-4 py-3">Next Service</th>
                                <th className="px-4 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {vehicles.map(v => {
                                const insWarn = isDateWarning(v.insurance_expiry);
                                const svcWarn = isDateWarning(v.next_service_date);
                                return (
                                    <tr key={v.id} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => onEdit(v)}>
                                        <td className="px-4 py-3">
                                            {v.photo_url ? (
                                                <img src={v.photo_url} alt={v.name} className="w-9 h-9 rounded-lg object-cover border border-white/10" />
                                            ) : (
                                                <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center"><Truck size={14} className="text-zinc-600" /></div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-white font-medium">{v.name}</td>
                                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">{v.vehicle_type.replace(/_/g, ' ')}</span></td>
                                        <td className="px-4 py-3 font-mono text-zinc-300">{v.license_plate}</td>
                                        <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{v.vin || '—'}</td>
                                        <td className="px-4 py-3 text-zinc-300">{[v.year, v.make, v.model].filter(Boolean).join(' ') || '—'}</td>
                                        <td className="px-4 py-3 text-right font-mono text-zinc-300">{v.capacity_weight_lbs ? `${v.capacity_weight_lbs.toLocaleString()} lbs` : '—'}</td>
                                        <td className="px-4 py-3 text-right font-mono text-zinc-300">{v.odometer_miles ? `${v.odometer_miles.toLocaleString()} mi` : '—'}</td>
                                        <td className={`px-4 py-3 font-mono text-xs ${dateBadgeClass(insWarn)}`}>
                                            {insWarn === 'expired' && <AlertTriangle size={12} className="inline mr-1" />}
                                            {formatDate(v.insurance_expiry)}
                                        </td>
                                        <td className={`px-4 py-3 font-mono text-xs ${dateBadgeClass(svcWarn)}`}>
                                            {svcWarn === 'expired' && <AlertTriangle size={12} className="inline mr-1" />}
                                            {formatDate(v.next_service_date)}
                                        </td>
                                        <td className="px-4 py-3"><Pencil size={14} className="text-zinc-500" /></td>
                                    </tr>
                                );
                            })}
                            {vehicles.length === 0 && (
                                <tr><td colSpan={11} className="px-4 py-12 text-center text-zinc-500">No vehicles configured. Add your first vehicle to get started.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}

/* ─── Drivers Tab ──────────────────────────────────────────────── */

function DriversTab({ drivers, onEdit, onAdd }: { drivers: Driver[]; onEdit: (d: Driver) => void; onAdd: () => void }) {
    const statusColors: Record<string, string> = {
        ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        INACTIVE: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
        ON_LEAVE: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };
    return (
        <Card variant="glass">
            <CardContent className="p-0">
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                    <span className="text-white font-semibold">Drivers</span>
                    <button onClick={onAdd} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gable-green/10 text-gable-green border border-gable-green/20 text-sm font-medium hover:bg-gable-green/20 transition-colors">
                        <Plus size={14} /> Add Driver
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-zinc-500 text-xs uppercase tracking-wider border-b border-white/5">
                                <th className="px-4 py-3 w-12"></th>
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3">Phone</th>
                                <th className="px-4 py-3">Email</th>
                                <th className="px-4 py-3">License #</th>
                                <th className="px-4 py-3">CDL</th>
                                <th className="px-4 py-3">CDL Expiry</th>
                                <th className="px-4 py-3">Hire Date</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {drivers.map(d => {
                                const cdlWarn = isDateWarning(d.cdl_expiry, 60);
                                return (
                                    <tr key={d.id} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => onEdit(d)}>
                                        <td className="px-4 py-3">
                                            {d.photo_url ? (
                                                <img src={d.photo_url} alt={d.name} className="w-9 h-9 rounded-full object-cover border border-white/10" />
                                            ) : (
                                                <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"><Users size={14} className="text-zinc-600" /></div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-white font-medium">{d.name}</td>
                                        <td className="px-4 py-3 font-mono text-zinc-300">{d.phone_number || '—'}</td>
                                        <td className="px-4 py-3 text-zinc-300">{d.email || '—'}</td>
                                        <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{d.license_number || '—'}</td>
                                        <td className="px-4 py-3 text-zinc-300">{d.cdl_class || '—'}</td>
                                        <td className={`px-4 py-3 font-mono text-xs ${dateBadgeClass(cdlWarn)}`}>
                                            {cdlWarn === 'expired' && <AlertTriangle size={12} className="inline mr-1" />}
                                            {formatDate(d.cdl_expiry)}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-zinc-300">{formatDate(d.hire_date)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${statusColors[d.status] || statusColors.ACTIVE}`}>
                                                {d.status.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3"><Pencil size={14} className="text-zinc-500" /></td>
                                    </tr>
                                );
                            })}
                            {drivers.length === 0 && (
                                <tr><td colSpan={10} className="px-4 py-12 text-center text-zinc-500">No drivers configured. Add your first driver to get started.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}

/* ─── Vehicle Modal ────────────────────────────────────────────── */

function VehicleModal({ vehicle, onClose, onSaved }: { vehicle?: Vehicle; onClose: () => void; onSaved: () => void }) {
    const isEdit = !!vehicle;
    const [form, setForm] = useState<CreateVehicleRequest & { id?: string }>({
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
    });
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [photoUrl, setPhotoUrl] = useState<string | undefined>(vehicle?.photo_url);
    const [uploading, setUploading] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            if (isEdit && vehicle) {
                await deliveryService.updateVehicle(vehicle.id, form as UpdateVehicleRequest);
            } else {
                await deliveryService.createVehicle(form);
            }
            onSaved();
            onClose();
        } catch { /* handled by parent */ } finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!vehicle || !confirm('Delete this vehicle? This action cannot be undone.')) return;
        setDeleting(true);
        try {
            await deliveryService.deleteVehicle(vehicle.id);
            onSaved();
            onClose();
        } catch { /* handled by parent */ } finally { setDeleting(false); }
    };

    const handlePhoto = async (file: File) => {
        if (!vehicle) return;
        setUploading(true);
        try {
            const url = await deliveryService.uploadVehiclePhoto(vehicle.id, file);
            setPhotoUrl(url);
            onSaved();
        } catch { /* ignore */ } finally { setUploading(false); }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-slate-steel border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <h2 className="text-lg font-semibold text-white">{isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
                    <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-zinc-400"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                    {/* Photo */}
                    {isEdit && (
                        <PhotoUploader
                            currentUrl={photoUrl}
                            uploading={uploading}
                            onSelect={handlePhoto}
                            shape="rounded-lg"
                            placeholder={<Truck size={24} className="text-zinc-600" />}
                        />
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} required />
                        <div>
                            <label className="block text-xs text-zinc-500 mb-1">Type</label>
                            <select value={form.vehicle_type} onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value as VehicleType }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                                {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="License Plate" value={form.license_plate} onChange={v => setForm(f => ({ ...f, license_plate: v }))} required />
                        <Field label="VIN" value={form.vin || ''} onChange={v => setForm(f => ({ ...f, vin: v || undefined }))} />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <NumField label="Year" value={form.year} onChange={v => setForm(f => ({ ...f, year: v }))} />
                        <Field label="Make" value={form.make || ''} onChange={v => setForm(f => ({ ...f, make: v || undefined }))} />
                        <Field label="Model" value={form.model || ''} onChange={v => setForm(f => ({ ...f, model: v || undefined }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <NumField label="Capacity (lbs)" value={form.capacity_weight_lbs} onChange={v => setForm(f => ({ ...f, capacity_weight_lbs: v }))} />
                        <NumField label="Odometer (mi)" value={form.odometer_miles} onChange={v => setForm(f => ({ ...f, odometer_miles: v }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <DateField label="Insurance Expiry" value={form.insurance_expiry || ''} onChange={v => setForm(f => ({ ...f, insurance_expiry: v || undefined }))} />
                        <DateField label="Next Service" value={form.next_service_date || ''} onChange={v => setForm(f => ({ ...f, next_service_date: v || undefined }))} />
                    </div>
                    <div>
                        <label className="block text-xs text-zinc-500 mb-1">Notes</label>
                        <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || undefined }))} rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none" />
                    </div>
                </div>
                <div className="flex items-center justify-between p-5 border-t border-white/5">
                    {isEdit ? (
                        <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 text-sm transition-colors">
                            <Trash2 size={14} /> {deleting ? 'Deleting...' : 'Delete'}
                        </button>
                    ) : <div />}
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:text-white text-sm transition-colors">Cancel</button>
                        <button onClick={handleSave} disabled={saving || !form.name || !form.license_plate} className="px-4 py-2 rounded-lg bg-gable-green text-black text-sm font-semibold hover:bg-gable-green/90 disabled:opacity-50 transition-colors">
                            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Vehicle'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Driver Modal ─────────────────────────────────────────────── */

function DriverModal({ driver, onClose, onSaved }: { driver?: Driver; onClose: () => void; onSaved: () => void }) {
    const isEdit = !!driver;
    const [form, setForm] = useState({
        name: driver?.name || '',
        license_number: driver?.license_number || undefined as string | undefined,
        phone_number: driver?.phone_number || undefined as string | undefined,
        status: (driver?.status || 'ACTIVE') as DriverStatus,
        cdl_class: driver?.cdl_class || undefined as string | undefined,
        cdl_expiry: driver?.cdl_expiry?.split('T')[0] || undefined as string | undefined,
        hire_date: driver?.hire_date?.split('T')[0] || undefined as string | undefined,
        email: driver?.email || undefined as string | undefined,
    });
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [photoUrl, setPhotoUrl] = useState<string | undefined>(driver?.photo_url);
    const [uploading, setUploading] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            if (isEdit && driver) {
                await deliveryService.updateDriver(driver.id, form as UpdateDriverRequest);
            } else {
                await deliveryService.createDriver(form as CreateDriverRequest);
            }
            onSaved();
            onClose();
        } catch { /* handled by parent */ } finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!driver || !confirm('Remove this driver? This action cannot be undone.')) return;
        setDeleting(true);
        try {
            await deliveryService.deleteDriver(driver.id);
            onSaved();
            onClose();
        } catch { /* handled by parent */ } finally { setDeleting(false); }
    };

    const handlePhoto = async (file: File) => {
        if (!driver) return;
        setUploading(true);
        try {
            const url = await deliveryService.uploadDriverPhoto(driver.id, file);
            setPhotoUrl(url);
            onSaved();
        } catch { /* ignore */ } finally { setUploading(false); }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-slate-steel border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <h2 className="text-lg font-semibold text-white">{isEdit ? 'Edit Driver' : 'Add Driver'}</h2>
                    <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-zinc-400"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-4">
                    {/* Photo */}
                    {isEdit && (
                        <PhotoUploader
                            currentUrl={photoUrl}
                            uploading={uploading}
                            onSelect={handlePhoto}
                            shape="rounded-full"
                            placeholder={<Users size={24} className="text-zinc-600" />}
                        />
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} required />
                        <Field label="Email" value={form.email || ''} onChange={v => setForm(f => ({ ...f, email: v || undefined }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Phone" value={form.phone_number || ''} onChange={v => setForm(f => ({ ...f, phone_number: v || undefined }))} />
                        <Field label="License #" value={form.license_number || ''} onChange={v => setForm(f => ({ ...f, license_number: v || undefined }))} />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs text-zinc-500 mb-1">CDL Class</label>
                            <select value={form.cdl_class || ''} onChange={e => setForm(f => ({ ...f, cdl_class: e.target.value || undefined }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                                {CDL_CLASSES.map(c => <option key={c} value={c}>{c || 'None'}</option>)}
                            </select>
                        </div>
                        <DateField label="CDL Expiry" value={form.cdl_expiry || ''} onChange={v => setForm(f => ({ ...f, cdl_expiry: v || undefined }))} />
                        <DateField label="Hire Date" value={form.hire_date || ''} onChange={v => setForm(f => ({ ...f, hire_date: v || undefined }))} />
                    </div>
                    {isEdit && (
                        <div>
                            <label className="block text-xs text-zinc-500 mb-1">Status</label>
                            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as DriverStatus }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                                {DRIVER_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                            </select>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between p-5 border-t border-white/5">
                    {isEdit ? (
                        <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 text-sm transition-colors">
                            <Trash2 size={14} /> {deleting ? 'Removing...' : 'Remove'}
                        </button>
                    ) : <div />}
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:text-white text-sm transition-colors">Cancel</button>
                        <button onClick={handleSave} disabled={saving || !form.name} className="px-4 py-2 rounded-lg bg-gable-green text-black text-sm font-semibold hover:bg-gable-green/90 disabled:opacity-50 transition-colors">
                            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Driver'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Photo Uploader ──────────────────────────────────────────── */

function PhotoUploader({ currentUrl, uploading, onSelect, shape, placeholder }: {
    currentUrl?: string;
    uploading: boolean;
    onSelect: (file: File) => void;
    shape: string;
    placeholder: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-4">
            <div className={`w-16 h-16 ${shape} overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center shrink-0`}>
                {currentUrl ? (
                    <img src={currentUrl} alt="Photo" className="w-full h-full object-cover" />
                ) : placeholder}
            </div>
            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-zinc-300 hover:bg-white/10 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload size={14} />
                {uploading ? 'Uploading...' : currentUrl ? 'Change Photo' : 'Upload Photo'}
                <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) onSelect(file);
                    }}
                />
            </label>
        </div>
    );
}

/* ─── Shared Form Fields ───────────────────────────────────────── */

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
    return (
        <div>
            <label className="block text-xs text-zinc-500 mb-1">{label}{required && ' *'}</label>
            <input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50" />
        </div>
    );
}

function NumField({ label, value, onChange }: { label: string; value?: number; onChange: (v?: number) => void }) {
    return (
        <div>
            <label className="block text-xs text-zinc-500 mb-1">{label}</label>
            <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50" />
        </div>
    );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div>
            <label className="block text-xs text-zinc-500 mb-1">{label}</label>
            <input type="date" value={value} onChange={e => onChange(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50" />
        </div>
    );
}
