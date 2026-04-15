import { useEffect, useState } from "react";
import { deliveryService } from "../../services/deliveryService";
import type { Driver, Route } from "../../types/delivery";
import { useNavigate } from "react-router-dom";
import { PageTransition } from "../../components/ui/PageTransition";
import { Card, CardContent } from "../../components/ui/Card";
import { Truck, MapPin, Calendar, ChevronRight, User } from "lucide-react";
import { useToast } from "../../components/ui/ToastContext";

export function RouteList() {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [selectedDriver, setSelectedDriver] = useState<string>("");
    const [routes, setRoutes] = useState<Route[]>([]);
    const navigate = useNavigate();
    const { showToast } = useToast();

    useEffect(() => {
        deliveryService.listDrivers().then(setDrivers).catch(() => { setDrivers([]); showToast('Failed to load drivers', 'error'); });
    }, [showToast]);

    useEffect(() => {
        let active = true;
        if (selectedDriver) {
            deliveryService.listRoutes(undefined, selectedDriver).then(data => {
                if (active) setRoutes(data);
            }).catch(() => { if (active) { setRoutes([]); showToast('Failed to load routes', 'error'); } });
        } else {
            setRoutes([]);
        }
        return () => { active = false; };
    }, [selectedDriver, showToast]);

    const statusConfig = (status: string) => {
        switch (status) {
            case 'IN_TRANSIT': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
            case 'COMPLETED': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
        }
    };

    return (
        <PageTransition>
            <div className="flex flex-col h-full space-y-4 p-4 max-w-md mx-auto">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                        <Truck className="w-6 h-6 text-gable-green" />
                        Driver App
                    </h1>
                </div>

                <Card variant="glass">
                    <CardContent className="p-4">
                        <label className="block text-xs font-mono uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-2">
                            <User className="w-3 h-3" />
                            Select Driver
                        </label>
                        <div className="relative">
                            <select
                                value={selectedDriver}
                                onChange={e => setSelectedDriver(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 text-white rounded-lg p-3 appearance-none focus:outline-none focus:border-gable-green/50 transition-colors"
                            >
                                <option value="">Choose your profile...</option>
                                {drivers.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronRight className="w-4 h-4 text-zinc-500 rotate-90" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-zinc-400 px-1">Assigned Routes</h2>
                    {routes.map(route => (
                        <Card
                            key={route.id}
                            variant="glass"
                            className="active:scale-[0.98] transition-transform cursor-pointer border-white/5 hover:border-gable-green/30"
                            onClick={() => navigate(`/driver/routes/${route.id}`)}
                        >
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2 text-zinc-400 text-sm font-mono">
                                        <Calendar className="w-3.5 h-3.5" />
                                        {new Date(route.scheduled_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </div>
                                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wide ${statusConfig(route.status)}`}>
                                        {route.status.replace('_', ' ')}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-1">{route.vehicle_name}</h3>
                                        {route.notes && <p className="text-xs text-zinc-500 italic truncate max-w-[200px]">{route.notes}</p>}
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-zinc-600" />
                                </div>

                                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono bg-white/5 px-2 py-1 rounded">
                                        <MapPin className="w-3 h-3 text-gable-green" />
                                        {route.stop_count} Stops
                                    </div>
                                    <div className="text-xs text-zinc-500">Tap to start</div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {selectedDriver && routes.length === 0 && (
                        <div className="text-center py-12 flex flex-col items-center gap-4 opacity-50">
                            <Truck className="w-12 h-12 text-zinc-600" />
                            <p className="text-zinc-400">No routes assigned today.</p>
                        </div>
                    )}

                    {!selectedDriver && (
                        <div className="text-center py-12 flex flex-col items-center gap-4 opacity-50">
                            <User className="w-12 h-12 text-zinc-600" />
                            <p className="text-zinc-400">Select a driver to view routes.</p>
                        </div>
                    )}
                </div>
            </div>
        </PageTransition>
    );
}
