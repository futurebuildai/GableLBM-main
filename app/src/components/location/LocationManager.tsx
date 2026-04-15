import React, { useEffect, useState, useCallback } from 'react';
import { LocationService } from '../../services/LocationService';
import type { Location, LocationType } from '../../types/location';
import { useToast } from '../ui/ToastContext';

export const LocationManager: React.FC = () => {
    const { showToast } = useToast();
    const [locations, setLocations] = useState<Location[]>([]);
    const [newCode, setNewCode] = useState('');
    const [newType, setNewType] = useState<LocationType>('ZONE');

    const loadLocations = useCallback(async () => {
        try {
            const data = await LocationService.listLocations();
            setLocations(data);
        } catch (error) {
            console.error(error);
            showToast('Failed to load locations', 'error');
        }
    }, [showToast]);

    useEffect(() => {
        // eslint-disable-next-line
        loadLocations();
    }, [loadLocations]);

    const handleCreate = async () => {
        try {
            await LocationService.createLocation({
                code: newCode,
                type: newType,
                path: newCode,
                // parent_id: ... TODO: Selection logic
            });
            setNewCode('');
            loadLocations();
        } catch {
            showToast('Failed to create location', 'error');
        }
    };

    return (
        <div className="p-6 bg-[#161821] text-white rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4 font-inter text-[#00FFA3]">Location Manager</h2>

            <div className="flex gap-2 mb-6">
                <input
                    className="bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none"
                    placeholder="Code (e.g. Zone A)"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                />
                <select
                    className="bg-black/20 border border-white/10 rounded px-3 py-2 text-white"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as LocationType)}
                >
                    <option value="YARD">Yard</option>
                    <option value="ZONE">Zone</option>
                    <option value="AISLE">Aisle</option>
                    <option value="BIN">Bin</option>
                </select>
                <button
                    onClick={handleCreate}
                    className="bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all"
                >
                    Create
                </button>
            </div>

            <div className="space-y-2">
                {locations.map((loc) => (
                    <div key={loc.id} className="flex justify-between items-center p-3 bg-white/5 rounded border border-white/5">
                        <div>
                            <span className="font-mono text-[#38BDF8] mr-2">{loc.type}</span>
                            <span className="font-bold">{loc.path || loc.code}</span>
                        </div>
                        <span className="text-xs text-white/40">{loc.id}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
