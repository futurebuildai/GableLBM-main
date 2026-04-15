import React, { useEffect, useState } from 'react';
import type { Route, RouteStatus } from '../../types/delivery';
import { deliveryService } from '../../services/deliveryService';
import { Plus, User, Truck, Clock, MapPin } from 'lucide-react';
import { Button } from '../ui/Button';
import { CreateRouteModal } from './CreateRouteModal';
import { useToast } from '../ui/ToastContext';

// Simple helper for dates
const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const StatusBadge: React.FC<{ status: RouteStatus }> = ({ status }) => {
    let styles = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    switch (status) {
        case 'SCHEDULED': styles = 'bg-sky-500/10 text-sky-400 border-sky-500/20'; break;
        case 'IN_TRANSIT': styles = 'bg-amber-500/10 text-amber-400 border-amber-500/20'; break;
        case 'COMPLETED': styles = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'; break;
        case 'CANCELLED': styles = 'bg-rose-500/10 text-rose-400 border-rose-500/20'; break;
    }
    return <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${styles}`}>{status.replace('_', ' ')}</span>;
};

interface RouteListProps {
    onSelectRoute: (routeId: string, vehicleId?: string, routeStatus?: RouteStatus) => void;
    selectedRouteId: string | null;
}

export const RouteList: React.FC<RouteListProps> = ({ onSelectRoute, selectedRouteId }) => {
    const { showToast } = useToast();
    const [routes, setRoutes] = useState<Route[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => {
        loadRoutes();
    }, [showToast]);

    const loadRoutes = async () => {
        try {
            const data = await deliveryService.listRoutes();
            setRoutes(data);
        } catch (err) {
            console.error(err);
            showToast('Failed to load routes', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-zinc-500 animate-pulse">Loading Routes...</div>;

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Active Routes</h2>
                <Button size="sm" className="h-8 px-2 shadow-glow" onClick={() => setShowCreateModal(true)}>
                    <Plus className="w-4 h-4" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {routes.map(route => {
                    const isSelected = selectedRouteId === route.id;
                    return (
                        <div
                            key={route.id}
                            onClick={() => onSelectRoute(route.id, route.vehicle_id, route.status)}
                            className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer group relative overflow-hidden ${isSelected
                                    ? 'bg-gable-green/10 border-gable-green/50 shadow-[0_0_15px_rgba(0,255,163,0.1)]'
                                    : 'bg-[#161821] border-white/5 hover:border-white/20 hover:bg-white/5'
                                }`}
                        >
                            {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gable-green" />}

                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                    <Truck className={`w-4 h-4 ${isSelected ? 'text-gable-green' : 'text-zinc-500'}`} />
                                    <span className={`font-bold font-mono ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                                        {route.vehicle_name}
                                    </span>
                                </div>
                                <StatusBadge status={route.status} />
                            </div>

                            <div className="flex items-center gap-2 text-sm text-zinc-400 mb-3 pl-6">
                                <User className="w-3.5 h-3.5 text-zinc-600" />
                                {route.driver_name}
                            </div>

                            <div className="flex justify-between items-end pl-6 border-t border-white/5 pt-3">
                                <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatDate(route.scheduled_date)}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs font-mono bg-white/5 px-2 py-1 rounded text-zinc-300 border border-white/5">
                                    <MapPin className="w-3 h-3 text-gable-green" />
                                    {route.stop_count} Stops
                                </div>
                            </div>
                        </div>
                    );
                })}
                {routes.length === 0 && (
                    <div className="text-zinc-500 text-center py-12 flex flex-col items-center gap-3">
                        <Truck className="w-8 h-8 opacity-20" />
                        <p>No active routes found.</p>
                    </div>
                )}
            </div>

            <CreateRouteModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onCreated={loadRoutes}
            />
        </div>
    );
};
