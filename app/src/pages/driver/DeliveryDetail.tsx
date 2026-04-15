import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { deliveryService } from "../../services/deliveryService";
import type { Delivery, DeliveryStatus } from "../../types/delivery";
import { PageTransition } from "../../components/ui/PageTransition";
import { Card, CardContent } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ArrowLeft, MapPin, FileText, CheckCircle, XCircle, AlertTriangle, PenTool, Navigation, Camera, Image, Trash2 } from "lucide-react";
import { useToast } from "../../components/ui/ToastContext";

interface PODPhotoPreview {
    file: File;
    preview: string;
    type: 'site' | 'damage';
}

export function DeliveryDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [delivery, setDelivery] = useState<Delivery | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // POD Modal State
    const [showPODModal, setShowPODModal] = useState(false);
    const [status, setStatus] = useState<DeliveryStatus>('DELIVERED');
    const [signedBy, setSignedBy] = useState("");

    // Photo capture
    const [podPhotos, setPodPhotos] = useState<PODPhotoPreview[]>([]);
    const photoInputRef = useRef<HTMLInputElement>(null);

    // Canvas Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [loadingDelivery, setLoadingDelivery] = useState(true);

    useEffect(() => {
        if (id) {
            deliveryService.getDelivery(id)
                .then(setDelivery)
                .catch(() => setDelivery(null))
                .finally(() => setLoadingDelivery(false));
        } else {
            setLoadingDelivery(false);
        }
    }, [id]);

    // Keep a ref to current photos so cleanup doesn't capture stale state
    const podPhotosRef = useRef(podPhotos);
    useEffect(() => { podPhotosRef.current = podPhotos; }, [podPhotos]);

    // Revoke blob URLs on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            podPhotosRef.current.forEach(p => URL.revokeObjectURL(p.preview));
        };
    }, []);

    // Photo handling
    const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        const newPhotos: PODPhotoPreview[] = [];
        for (const file of Array.from(files)) {
            newPhotos.push({
                file,
                preview: URL.createObjectURL(file),
                type: 'site',
            });
        }
        setPodPhotos(prev => [...prev, ...newPhotos]);
        // Reset input
        if (photoInputRef.current) photoInputRef.current.value = '';
    };

    const removePhoto = (index: number) => {
        setPodPhotos(prev => {
            const updated = [...prev];
            URL.revokeObjectURL(updated[index].preview);
            updated.splice(index, 1);
            return updated;
        });
    };

    const togglePhotoType = (index: number) => {
        setPodPhotos(prev => {
            const updated = [...prev];
            updated[index] = {
                ...updated[index],
                type: updated[index].type === 'site' ? 'damage' : 'site',
            };
            return updated;
        });
    };

    // Canvas Logic
    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        setIsDrawing(true);
        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;
        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };

    const stopDrawing = () => setIsDrawing(false);
    const clearSignature = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        ctx?.clearRect(0, 0, canvas?.width || 0, canvas?.height || 0);
    };

    const handleSubmit = async () => {
        if (!delivery) return;
        setIsSubmitting(true);
        try {
            // 1. Upload all POD photos first
            for (const photo of podPhotos) {
                await deliveryService.uploadPODPhoto(delivery.id, photo.file, photo.type);
            }

            // 2. Get signature data URL
            let signatureDataUrl: string | undefined;
            let proofUrl: string | undefined;
            if (status === 'DELIVERED' && canvasRef.current) {
                signatureDataUrl = canvasRef.current.toDataURL("image/png");
                proofUrl = signatureDataUrl; // Use signature as proof URL for backward compat
            }

            // 3. Update delivery status with signature
            await deliveryService.updateStatus(delivery.id, {
                status,
                pod_proof_url: proofUrl,
                pod_signed_by: signedBy || "Unknown",
                signature_data_url: signatureDataUrl,
            });

            setShowPODModal(false);
            podPhotos.forEach(p => URL.revokeObjectURL(p.preview));
            setPodPhotos([]);
            const updated = await deliveryService.getDelivery(delivery.id);
            setDelivery(updated);
            showToast("Delivery completed successfully", "success");
        } catch {
            showToast("Failed to update status", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loadingDelivery) return <div className="p-8 text-center text-zinc-500">Loading Delivery...</div>;
    if (!delivery) return <div className="p-8 text-center text-zinc-500">Delivery not found.</div>;

    const statusColor = delivery.status === 'DELIVERED' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
        delivery.status === 'FAILED' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
            'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';

    return (
        <PageTransition>
            <div className="pb-24 pt-4 px-4 space-y-4 max-w-md mx-auto min-h-screen flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-4 mb-2">
                    <button onClick={() => navigate(-1)} aria-label="Go back" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="font-bold text-lg text-white">Delivery Details</div>
                </div>

                {/* Status Card */}
                <Card variant="glass" className="border-t-4 border-t-gable-green">
                    <CardContent className="p-6 text-center">
                        <div className={`mx-auto w-fit px-3 py-1 rounded-full text-xs font-mono font-bold uppercase border mb-2 ${statusColor}`}>
                            {delivery.status}
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-1">{delivery.customer_name}</h2>
                        <p className="text-zinc-400 text-sm flex items-center justify-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            Order #{delivery.order_number}
                        </p>
                    </CardContent>
                </Card>

                {/* Location Card */}
                <Card variant="glass">
                    <CardContent className="p-6 space-y-4">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                                <MapPin className="w-5 h-5 text-blue-400" />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-mono uppercase text-zinc-500 block mb-1">Delivery Address</label>
                                <p className="text-zinc-200 leading-snug">{delivery.address}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                                <Navigation className="w-5 h-5 text-amber-400" />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-mono uppercase text-zinc-500 block mb-1">Instructions</label>
                                <p className="text-zinc-300 text-sm italic bg-white/5 p-3 rounded-lg border border-white/5">
                                    "{delivery.delivery_instructions || "No special instructions provided."}"
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Action Button */}
                {delivery.status !== 'DELIVERED' && (
                    <div className="fixed bottom-6 left-4 right-4 max-w-md mx-auto">
                        <Button
                            onClick={() => setShowPODModal(true)}
                            className="w-full h-14 text-lg font-bold shadow-glow"
                        >
                            Complete Delivery
                        </Button>
                    </div>
                )}

                {/* POD Modal */}
                {showPODModal && (
                    <div className="fixed inset-0 bg-black/90 z-[100] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-[#161821] w-full max-w-md rounded-2xl border border-white/10 p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <PenTool className="w-5 h-5 text-gable-green" />
                                    Proof of Delivery
                                </h2>
                                <button onClick={() => setShowPODModal(false)} className="text-zinc-500 hover:text-white">
                                    <XCircle className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-mono uppercase text-zinc-500 mb-2">Delivery Status</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setStatus('DELIVERED')}
                                            className={`p-3 rounded-lg border text-sm font-bold transition-all ${status === 'DELIVERED' ? 'bg-gable-green/20 border-gable-green text-gable-green' : 'bg-white/5 border-white/10 text-zinc-400'}`}
                                        >
                                            <CheckCircle className="w-5 h-5 mx-auto mb-1" />
                                            Delivered
                                        </button>
                                        <button
                                            onClick={() => setStatus('FAILED')}
                                            className={`p-3 rounded-lg border text-sm font-bold transition-all ${status === 'FAILED' ? 'bg-rose-500/20 border-rose-500 text-rose-500' : 'bg-white/5 border-white/10 text-zinc-400'}`}
                                        >
                                            <AlertTriangle className="w-5 h-5 mx-auto mb-1" />
                                            Failed
                                        </button>
                                    </div>
                                </div>

                                {status === 'DELIVERED' && (
                                    <>
                                        {/* Photo Capture Section */}
                                        <div>
                                            <label className="block text-xs font-mono uppercase text-zinc-500 mb-2">Site Photos</label>
                                            <div className="flex gap-2 mb-3">
                                                <button
                                                    onClick={() => photoInputRef.current?.click()}
                                                    className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-zinc-600 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors text-sm"
                                                >
                                                    <Camera className="w-4 h-4" />
                                                    Take Photo
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const input = document.createElement('input');
                                                        input.type = 'file';
                                                        input.accept = 'image/*';
                                                        input.multiple = true;
                                                        input.onchange = (e) => handlePhotoCapture(e as unknown as React.ChangeEvent<HTMLInputElement>);
                                                        input.click();
                                                    }}
                                                    className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-zinc-600 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors text-sm"
                                                >
                                                    <Image className="w-4 h-4" />
                                                    Gallery
                                                </button>
                                            </div>
                                            <input
                                                ref={photoInputRef}
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                onChange={handlePhotoCapture}
                                                className="hidden"
                                            />

                                            {/* Photo Previews */}
                                            {podPhotos.length > 0 && (
                                                <div className="grid grid-cols-3 gap-2">
                                                    {podPhotos.map((photo, idx) => (
                                                        <div key={idx} className="relative group rounded-lg overflow-hidden border border-white/10">
                                                            <img src={photo.preview} alt={`POD ${idx}`} className="w-full h-20 object-cover" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                                                <button
                                                                    onClick={() => togglePhotoType(idx)}
                                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${photo.type === 'damage' ? 'bg-rose-500 text-white' : 'bg-blue-500 text-white'}`}
                                                                >
                                                                    {photo.type}
                                                                </button>
                                                                <button
                                                                    onClick={() => removePhoto(idx)}
                                                                    className="p-1 rounded bg-rose-500/80 text-white"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                            <div className={`absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold py-0.5 ${photo.type === 'damage' ? 'bg-rose-500/80 text-white' : 'bg-blue-500/80 text-white'}`}>
                                                                {photo.type.toUpperCase()}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-xs font-mono uppercase text-zinc-500 mb-2">Recipient Name</label>
                                            <input
                                                type="text"
                                                value={signedBy}
                                                onChange={e => setSignedBy(e.target.value)}
                                                className="w-full bg-black/20 border border-white/10 p-3 rounded-lg text-white focus:outline-none focus:border-gable-green/50"
                                                placeholder="Received by..."
                                            />
                                        </div>
                                        <div>
                                            <div className="flex justify-between mb-2">
                                                <label className="text-xs font-mono uppercase text-zinc-500">Signature</label>
                                                <button onClick={clearSignature} className="text-xs text-rose-400 font-medium hover:underline">Clear</button>
                                            </div>
                                            <div className="bg-white rounded-lg overflow-hidden h-48 touch-none border-2 border-dashed border-zinc-600 relative">
                                                <div className="absolute inset-0 flex items-center justify-center text-zinc-300 pointer-events-none opacity-20 text-3xl font-bold select-none">
                                                    SIGN HERE
                                                </div>
                                                <canvas
                                                    ref={canvasRef}
                                                    width={400}
                                                    height={192}
                                                    className="w-full h-full cursor-crosshair relative z-10"
                                                    onMouseDown={startDrawing}
                                                    onMouseMove={draw}
                                                    onMouseUp={stopDrawing}
                                                    onMouseLeave={stopDrawing}
                                                    onTouchStart={startDrawing}
                                                    onTouchMove={draw}
                                                    onTouchEnd={stopDrawing}
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                <Button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting || (status === 'DELIVERED' && !signedBy)}
                                    isLoading={isSubmitting}
                                    className="w-full h-12 shadow-glow font-bold text-lg"
                                >
                                    {isSubmitting
                                        ? `Uploading ${podPhotos.length > 0 ? `${podPhotos.length} photos...` : '...'}`
                                        : 'Confirm Delivery'
                                    }
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </PageTransition>
    );
}
