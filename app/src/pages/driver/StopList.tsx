import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { deliveryService } from "../../services/deliveryService";
import type { Delivery } from "../../types/delivery";
import { PageTransition } from "../../components/ui/PageTransition";
import { Card, CardContent } from "../../components/ui/Card";
import { ArrowLeft, MapPin, CheckCircle, Navigation, Package } from "lucide-react";
import { useToast } from "../../components/ui/ToastContext";

export function StopList() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) {
            setLoading(true);
            deliveryService.listDeliveries(id)
                .then(setDeliveries)
                .catch(() => { setDeliveries([]); showToast('Failed to load deliveries', 'error'); })
                .finally(() => setLoading(false));
        }
    }, [id, showToast]);

    if (!id) return <div>Invalid Route</div>;

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen bg-[#0A0B10]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gable-green"></div>
            </div>
        );
    }

    // Calculate progress
    const completedCount = deliveries.filter(d => d.status === 'DELIVERED').length;
    const progress = deliveries.length > 0 ? (completedCount / deliveries.length) * 100 : 0;

    return (
        <PageTransition>
            <div className="flex flex-col h-full space-y-4 p-4 max-w-md mx-auto min-h-screen">
                {/* Header */}
                <div className="flex items-center gap-4 mb-2">
                    <button onClick={() => navigate('/driver')} aria-label="Go back" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="font-bold text-lg text-white">Route Stops</div>
                        <div className="text-xs text-zinc-500 font-mono flex items-center gap-2">
                            {completedCount} / {deliveries.length} COMPLETED
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gable-green transition-all duration-1000 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <div className="space-y-4 relative pb-20">
                    {/* Timeline Line */}
                    {deliveries.length > 0 && (
                        <div className="absolute left-[1.65rem] top-4 bottom-4 w-px bg-white/10"></div>
                    )}

                    {deliveries.length === 0 && (
                        <div className="text-zinc-500 text-center py-12 flex flex-col items-center gap-4 opacity-50">
                            <Package className="w-12 h-12 text-zinc-600" />
                            <p>No stops assigned to this route.</p>
                        </div>
                    )}

                    {deliveries.map((d, index) => {
                        const isNext = d.status === 'PENDING' && (index === 0 || deliveries[index - 1].status !== 'PENDING');
                        const isCompleted = d.status === 'DELIVERED';
                        const isFailed = d.status === 'FAILED';

                        return (
                            <div key={d.id} className="relative pl-10">
                                {/* Timeline Node */}
                                <div className={`absolute left-0 top-6 -translate-y-1/2 w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs z-10 bg-[#0A0B10] transition-colors ${isCompleted ? 'border-gable-green text-gable-green' :
                                    isFailed ? 'border-rose-500 text-rose-500' :
                                        isNext ? 'border-white text-white shadow-[0_0_10px_rgba(255,255,255,0.3)]' :
                                            'border-zinc-700 text-zinc-500'
                                    }`}>
                                    {isCompleted ? <CheckCircle className="w-4 h-4" /> : index + 1}
                                </div>

                                <Card
                                    variant="glass"
                                    className={`
                                        transition-all active:scale-[0.98] cursor-pointer relative overflow-hidden
                                        ${isNext ? 'border-gable-green/50 bg-gable-green/5' : 'border-white/5'}
                                        ${isCompleted ? 'opacity-60 grayscale-[0.5]' : ''}
                                    `}
                                    onClick={() => navigate(`/driver/deliveries/${d.id}`)}
                                >
                                    {isNext && <div className="absolute top-0 right-0 px-2 py-0.5 bg-gable-green text-black text-[10px] font-bold font-mono uppercase rounded-bl-lg">Next Stop</div>}

                                    <CardContent className="p-4">
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className={`font-bold text-lg ${isCompleted ? 'text-zinc-400' : 'text-white'}`}>{d.customer_name}</h3>
                                        </div>

                                        <div className="flex items-start gap-2 text-zinc-400 text-sm mb-3">
                                            <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-zinc-600" />
                                            {d.address}
                                        </div>

                                        <div className="flex items-center justify-between pt-3 border-t border-white/5">
                                            <div className="text-xs font-mono text-zinc-500">
                                                Order #{d.order_number}
                                            </div>
                                            {isNext && (
                                                <div className="text-xs font-bold text-gable-green flex items-center gap-1">
                                                    NAVIGATE <Navigation className="w-3 h-3" />
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        );
                    })}
                </div>
            </div>
        </PageTransition>
    );
}
