import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { Delivery, RouteStatus } from '../../types/delivery';
import { deliveryService } from '../../services/deliveryService';
import { MapPin, Box, FileText, ArrowRight, ArrowUp, ArrowDown, RotateCcw, Play, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '../ui/Button';
import { AssignOrderModal } from './AssignOrderModal';
import { useToast } from '../ui/ToastContext';

interface DeliveryListProps {
    routeId: string | null;
    vehicleId?: string;
    routeStatus?: RouteStatus;
    onDeliveriesChange?: (deliveries: Delivery[]) => void;
}

export const DeliveryList: React.FC<DeliveryListProps> = ({ routeId, vehicleId, routeStatus, onDeliveriesChange }) => {
    const { showToast } = useToast();
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [loading, setLoading] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [reordering, setReordering] = useState(false);
    const [completing, setCompleting] = useState(false);

    const loadDeliveries = useCallback(async (id: string) => {
        setLoading(true);
        try {
            const data = await deliveryService.listDeliveries(id);
            setDeliveries(data);
            onDeliveriesChange?.(data);
        } catch (err) {
            console.error(err);
            showToast('Failed to load deliveries', 'error');
        } finally {
            setLoading(false);
        }
    }, [onDeliveriesChange, showToast]);

    useEffect(() => {
        if (routeId) {
            loadDeliveries(routeId);
        } else {
            setDeliveries([]);
            onDeliveriesChange?.([]);
        }
    }, [routeId, loadDeliveries, onDeliveriesChange]);

    const moveStop = async (index: number, direction: 'up' | 'down') => {
        if (!routeId) return;
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= deliveries.length) return;

        const reordered = [...deliveries];
        [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];

        setReordering(true);
        try {
            await deliveryService.reorderStops(routeId, reordered.map(d => d.id));
            setDeliveries(reordered);
            onDeliveriesChange?.(reordered);
        } catch {
            showToast('Failed to reorder stops', 'error');
        } finally {
            setReordering(false);
        }
    };

    const reverseRoute = async () => {
        if (!routeId || deliveries.length < 2) return;
        const reversed = [...deliveries].reverse();
        setReordering(true);
        try {
            await deliveryService.reorderStops(routeId, reversed.map(d => d.id));
            setDeliveries(reversed);
            onDeliveriesChange?.(reversed);
            showToast('Route order reversed', 'success');
        } catch {
            showToast('Failed to reverse route', 'error');
        } finally {
            setReordering(false);
        }
    };

    const dispatchRoute = async () => {
        if (!routeId) return;
        try {
            await deliveryService.dispatchRoute(routeId);
            showToast('Route dispatched — driver notified', 'success');
        } catch {
            showToast('Failed to dispatch route', 'error');
        }
    };

    const completeRoute = async () => {
        if (!routeId) return;
        setCompleting(true);
        try {
            await deliveryService.completeRoute(routeId);
            showToast('Route marked as completed', 'success');
        } catch {
            showToast('Failed to complete route — ensure all deliveries have a terminal status', 'error');
        } finally {
            setCompleting(false);
        }
    };

    const allTerminal = useMemo(() => {
        if (deliveries.length === 0) return false;
        return deliveries.every(d => d.status === 'DELIVERED' || d.status === 'FAILED' || d.status === 'PARTIAL');
    }, [deliveries]);

    if (!routeId) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4 p-12">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                    <MapPin className="w-8 h-8 opacity-50" />
                </div>
                <p>Select a route from the left to view its delivery manifest.</p>
            </div>
        );
    }

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gable-green"></div>
            <p>Loading Manifest...</p>
        </div>
    );

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-sky-400" />
                    Delivery Manifest
                </h2>
                <div className="flex items-center gap-2">
                    {deliveries.length >= 2 && (
                        <button
                            onClick={reverseRoute}
                            disabled={reordering}
                            className="p-1.5 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
                            title="Reverse stop order"
                            aria-label="Reverse stop order"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {deliveries.length > 0 && routeStatus !== 'COMPLETED' && routeStatus !== 'CANCELLED' && (
                        <>
                            {routeStatus === 'IN_TRANSIT' && allTerminal ? (
                                <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-500" onClick={completeRoute} disabled={completing}>
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> {completing ? 'Completing...' : 'Complete Route'}
                                </Button>
                            ) : (
                                <Button size="sm" className="h-7 px-2 text-xs" onClick={dispatchRoute}>
                                    <Play className="w-3 h-3 mr-1" /> Dispatch
                                </Button>
                            )}
                        </>
                    )}
                    {routeStatus && (
                        <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                            routeStatus === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            routeStatus === 'IN_TRANSIT' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            routeStatus === 'CANCELLED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                            'bg-white/5 text-zinc-400 border-white/10'
                        }`}>
                            {routeStatus.replace(/_/g, ' ')}
                        </span>
                    )}
                    <span className="text-xs text-zinc-400 font-mono ml-1">
                        {deliveries.length} DROPS
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 relative">
                {/* Timeline Line */}
                {deliveries.length > 0 && (
                    <div className="absolute left-[2.25rem] top-6 bottom-6 w-px bg-gradient-to-b from-gable-green/50 via-white/10 to-transparent"></div>
                )}

                {deliveries.map((delivery, index) => (
                    <div key={delivery.id} className="relative pl-12 group">
                        {/* Timeline Node */}
                        <div className="absolute left-6 top-6 -translate-x-1/2 w-6 h-6 rounded-full bg-[#0A0B10] border-2 border-gable-green flex items-center justify-center shadow-[0_0_10px_rgba(0,255,163,0.3)] z-10 text-[10px] font-bold text-white">
                            {index + 1}
                        </div>

                        <div className="bg-[#161821] border border-white/5 p-5 rounded-xl hover:border-gable-green/30 hover:bg-white/5 transition-all duration-300 group-hover:translate-x-1">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-lg text-white group-hover:text-gable-green transition-colors">{delivery.customer_name}</span>
                                <div className="flex items-center gap-2">
                                    {/* Reorder buttons */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <button
                                            disabled={index === 0 || reordering}
                                            onClick={(e) => { e.stopPropagation(); moveStop(index, 'up'); }}
                                            className="p-1 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                                            title="Move up"
                                            aria-label="Move up"
                                        >
                                            <ArrowUp className="w-3 h-3" />
                                        </button>
                                        <button
                                            disabled={index === deliveries.length - 1 || reordering}
                                            onClick={(e) => { e.stopPropagation(); moveStop(index, 'down'); }}
                                            className="p-1 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                                            title="Move down"
                                            aria-label="Move down"
                                        >
                                            <ArrowDown className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <span className="text-[10px] font-mono uppercase bg-white/5 px-2 py-1 rounded text-zinc-400 border border-white/5">
                                        {delivery.status}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-start gap-2 text-zinc-400 text-sm mb-4">
                                <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-zinc-600" />
                                {delivery.address}
                            </div>

                            <div className="flex items-center gap-4 text-xs font-mono text-zinc-500 pl-6 border-l-2 border-white/5">
                                <span className="flex items-center gap-1.5">
                                    <Box className="w-3 h-3" />
                                    Order #{delivery.order_number}
                                </span>
                                {delivery.estimated_arrival && (
                                    <span className="flex items-center gap-1.5 text-sky-400">
                                        <Clock className="w-3 h-3" />
                                        ETA {new Date(delivery.estimated_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>

                            {delivery.delivery_instructions && (
                                <div className="mt-4 text-sm bg-amber-500/5 text-amber-500/90 p-3 rounded-lg border border-amber-500/10 italic flex gap-2">
                                    <span className="not-italic font-bold text-[10px] px-1.5 py-0.5 bg-amber-500/20 rounded h-fit">NOTE</span>
                                    {delivery.delivery_instructions}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {deliveries.length === 0 && (
                    <div className="text-zinc-500 text-center py-12">No deliveries assigned to this route.</div>
                )}
            </div>

            <div className="p-4 border-t border-white/5 bg-white/5">
                <Button
                    variant="outline"
                    className="w-full border-dashed border-white/20 hover:border-gable-green/50 text-gable-green hover:bg-gable-green/5"
                    onClick={() => setShowAssignModal(true)}
                >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Assign Order to Route
                </Button>
            </div>

            {routeId && (
                <AssignOrderModal
                    isOpen={showAssignModal}
                    onClose={() => setShowAssignModal(false)}
                    routeId={routeId}
                    vehicleId={vehicleId || ''}
                    existingDeliveries={deliveries}
                    onAssigned={() => loadDeliveries(routeId)}
                />
            )}
        </div>
    );
};
