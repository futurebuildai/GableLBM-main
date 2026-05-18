import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ArrowLeft, MapPin, FileText, CheckCircle, XCircle, AlertTriangle, PenTool, Navigation, Camera, Image, Trash2 } from 'lucide';
import { deliveryService } from '../../services/deliveryService';
import type { Delivery, DeliveryStatus } from '../../types/delivery';

interface PODPhotoPreview {
    file: File;
    preview: string;
    type: 'site' | 'damage';
}

@customElement('gable-delivery-detail')
export class DeliveryDetail extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private delivery: Delivery | null = null;
    @state() private isSubmitting = false;
    @state() private showPODModal = false;
    @state() private status: DeliveryStatus = 'DELIVERED';
    @state() private signedBy = '';
    @state() private podPhotos: PODPhotoPreview[] = [];
    @state() private isDrawing = false;
    @state() private loadingDelivery = true;

    private _canvasRef: HTMLCanvasElement | null = null;
    private _photoInputRef: HTMLInputElement | null = null;

    connectedCallback() {
        super.connectedCallback();
        if (this.routeId) {
            deliveryService.getDelivery(this.routeId)
                .then(d => { this.delivery = d; })
                .catch(() => { this.delivery = null; })
                .finally(() => { this.loadingDelivery = false; });
        } else {
            this.loadingDelivery = false;
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.podPhotos.forEach(p => URL.revokeObjectURL(p.preview));
    }

    private _getCanvas(): HTMLCanvasElement | null {
        if (!this._canvasRef) {
            this._canvasRef = this.querySelector('canvas');
        }
        return this._canvasRef;
    }

    private _handlePhotoCapture(e: Event) {
        const input = e.target as HTMLInputElement;
        const files = input.files;
        if (!files) return;
        const newPhotos: PODPhotoPreview[] = [];
        for (const file of Array.from(files)) {
            newPhotos.push({
                file,
                preview: URL.createObjectURL(file),
                type: 'site',
            });
        }
        this.podPhotos = [...this.podPhotos, ...newPhotos];
        input.value = '';
    }

    private _removePhoto(index: number) {
        const updated = [...this.podPhotos];
        URL.revokeObjectURL(updated[index].preview);
        updated.splice(index, 1);
        this.podPhotos = updated;
    }

    private _togglePhotoType(index: number) {
        const updated = [...this.podPhotos];
        updated[index] = {
            ...updated[index],
            type: updated[index].type === 'site' ? 'damage' : 'site',
        };
        this.podPhotos = updated;
    }

    private _startDrawing(e: MouseEvent | TouchEvent) {
        const canvas = this._getCanvas();
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        this.isDrawing = true;
        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
    }

    private _draw(e: MouseEvent | TouchEvent) {
        if (!this.isDrawing) return;
        const canvas = this._getCanvas();
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;
        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    }

    private _stopDrawing() { this.isDrawing = false; }

    private _clearSignature() {
        const canvas = this._getCanvas();
        const ctx = canvas?.getContext('2d');
        ctx?.clearRect(0, 0, canvas?.width || 0, canvas?.height || 0);
    }

    private async _handleSubmit() {
        if (!this.delivery) return;
        this.isSubmitting = true;
        try {
            for (const photo of this.podPhotos) {
                await deliveryService.uploadPODPhoto(this.delivery.id, photo.file, photo.type);
            }

            let signatureDataUrl: string | undefined;
            let proofUrl: string | undefined;
            const canvas = this._getCanvas();
            if (this.status === 'DELIVERED' && canvas) {
                signatureDataUrl = canvas.toDataURL('image/png');
                proofUrl = signatureDataUrl;
            }

            await deliveryService.updateStatus(this.delivery.id, {
                status: this.status,
                pod_proof_url: proofUrl,
                pod_signed_by: this.signedBy || 'Unknown',
                signature_data_url: signatureDataUrl,
            });

            this.showPODModal = false;
            this.podPhotos.forEach(p => URL.revokeObjectURL(p.preview));
            this.podPhotos = [];
            const updated = await deliveryService.getDelivery(this.delivery.id);
            this.delivery = updated;
            ToastService.show('Delivery completed successfully', 'success');
        } catch {
            ToastService.show('Failed to update status', 'error');
        } finally {
            this.isSubmitting = false;
        }
    }

    render() {
        if (this.loadingDelivery) return html`<div class="p-8 text-center text-zinc-500">Loading Delivery...</div>`;
        if (!this.delivery) return html`<div class="p-8 text-center text-zinc-500">Delivery not found.</div>`;

        const d = this.delivery;
        const statusColor = d.status === 'DELIVERED' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
            d.status === 'FAILED' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
            'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';

        return html`
            <div class="pb-24 pt-4 px-4 space-y-4 max-w-md mx-auto min-h-screen flex flex-col">
                <!-- Header -->
                <div class="flex items-center gap-4 mb-2">
                    <button @click=${() => router.back()} aria-label="Go back" class="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors">
                        ${icon(ArrowLeft, 20)}
                    </button>
                    <div class="font-bold text-lg text-white">Delivery Details</div>
                </div>

                <!-- Status Card -->
                <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl border-t-4 border-t-gable-green">
                    <div class="p-6 text-center">
                        <div class="mx-auto w-fit px-3 py-1 rounded-full text-xs font-mono font-bold uppercase border mb-2 ${statusColor}">
                            ${d.status}
                        </div>
                        <h2 class="text-2xl font-bold text-white mb-1">${d.customer_name}</h2>
                        <p class="text-zinc-400 text-sm flex items-center justify-center gap-1.5">
                            ${icon(FileText, 14)}
                            Order #${d.order_number}
                        </p>
                    </div>
                </div>

                <!-- Location Card -->
                <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                    <div class="p-6 space-y-4">
                        <div class="flex items-start gap-4">
                            <div class="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                                ${icon(MapPin, 20, 'text-blue-400')}
                            </div>
                            <div class="flex-1">
                                <label class="text-xs font-mono uppercase text-zinc-500 block mb-1">Delivery Address</label>
                                <p class="text-zinc-200 leading-snug">${d.address}</p>
                            </div>
                        </div>

                        <div class="flex items-start gap-4">
                            <div class="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                                ${icon(Navigation, 20, 'text-amber-400')}
                            </div>
                            <div class="flex-1">
                                <label class="text-xs font-mono uppercase text-zinc-500 block mb-1">Instructions</label>
                                <p class="text-zinc-300 text-sm italic bg-white/5 p-3 rounded-lg border border-white/5">
                                    "${d.delivery_instructions || 'No special instructions provided.'}"
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Action Button -->
                ${d.status !== 'DELIVERED' ? html`
                    <div class="fixed bottom-6 left-4 right-4 max-w-md mx-auto">
                        <button
                            @click=${() => { this.showPODModal = true; this._canvasRef = null; }}
                            class="w-full h-14 text-lg font-bold shadow-glow bg-gable-green text-black rounded-xl hover:bg-gable-green/90 transition-colors"
                        >
                            Complete Delivery
                        </button>
                    </div>
                ` : nothing}

                <!-- POD Modal -->
                ${this.showPODModal ? html`
                    <div class="fixed inset-0 bg-black/90 z-[100] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div class="bg-[#161821] w-full max-w-md rounded-2xl border border-white/10 p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                            <div class="flex justify-between items-center">
                                <h2 class="text-xl font-bold text-white flex items-center gap-2">
                                    ${icon(PenTool, 20, 'text-gable-green')}
                                    Proof of Delivery
                                </h2>
                                <button @click=${() => { this.showPODModal = false; }} class="text-zinc-500 hover:text-white">
                                    ${icon(XCircle, 24)}
                                </button>
                            </div>

                            <div class="space-y-4">
                                <div>
                                    <label class="block text-xs font-mono uppercase text-zinc-500 mb-2">Delivery Status</label>
                                    <div class="grid grid-cols-2 gap-3">
                                        <button
                                            @click=${() => { this.status = 'DELIVERED'; }}
                                            class="p-3 rounded-lg border text-sm font-bold transition-all ${this.status === 'DELIVERED' ? 'bg-gable-green/20 border-gable-green text-gable-green' : 'bg-white/5 border-white/10 text-zinc-400'}"
                                        >
                                            ${icon(CheckCircle, 20, 'mx-auto mb-1')}
                                            Delivered
                                        </button>
                                        <button
                                            @click=${() => { this.status = 'FAILED'; }}
                                            class="p-3 rounded-lg border text-sm font-bold transition-all ${this.status === 'FAILED' ? 'bg-rose-500/20 border-rose-500 text-rose-500' : 'bg-white/5 border-white/10 text-zinc-400'}"
                                        >
                                            ${icon(AlertTriangle, 20, 'mx-auto mb-1')}
                                            Failed
                                        </button>
                                    </div>
                                </div>

                                ${this.status === 'DELIVERED' ? html`
                                    <!-- Photo Capture Section -->
                                    <div>
                                        <label class="block text-xs font-mono uppercase text-zinc-500 mb-2">Site Photos</label>
                                        <div class="flex gap-2 mb-3">
                                            <button
                                                @click=${() => { this._photoInputRef = this.querySelector('#pod-photo-input'); this._photoInputRef?.click(); }}
                                                class="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-zinc-600 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors text-sm"
                                            >
                                                ${icon(Camera, 16)} Take Photo
                                            </button>
                                            <button
                                                @click=${() => {
                                                    const input = document.createElement('input');
                                                    input.type = 'file';
                                                    input.accept = 'image/*';
                                                    input.multiple = true;
                                                    input.onchange = (e) => this._handlePhotoCapture(e);
                                                    input.click();
                                                }}
                                                class="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-zinc-600 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors text-sm"
                                            >
                                                ${icon(Image, 16)} Gallery
                                            </button>
                                        </div>
                                        <input
                                            id="pod-photo-input"
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            @change=${(e: Event) => this._handlePhotoCapture(e)}
                                            class="hidden"
                                        />

                                        ${this.podPhotos.length > 0 ? html`
                                            <div class="grid grid-cols-3 gap-2">
                                                ${this.podPhotos.map((photo, idx) => html`
                                                    <div class="relative group rounded-lg overflow-hidden border border-white/10">
                                                        <img src="${photo.preview}" alt="POD ${idx}" class="w-full h-20 object-cover" />
                                                        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                                            <button
                                                                @click=${() => this._togglePhotoType(idx)}
                                                                class="px-1.5 py-0.5 rounded text-[10px] font-bold ${photo.type === 'damage' ? 'bg-rose-500 text-white' : 'bg-blue-500 text-white'}"
                                                            >
                                                                ${photo.type}
                                                            </button>
                                                            <button
                                                                @click=${() => this._removePhoto(idx)}
                                                                class="p-1 rounded bg-rose-500/80 text-white"
                                                            >
                                                                ${icon(Trash2, 12)}
                                                            </button>
                                                        </div>
                                                        <div class="absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold py-0.5 ${photo.type === 'damage' ? 'bg-rose-500/80 text-white' : 'bg-blue-500/80 text-white'}">
                                                            ${photo.type.toUpperCase()}
                                                        </div>
                                                    </div>
                                                `)}
                                            </div>
                                        ` : nothing}
                                    </div>

                                    <div>
                                        <label class="block text-xs font-mono uppercase text-zinc-500 mb-2">Recipient Name</label>
                                        <input
                                            type="text"
                                            .value=${this.signedBy}
                                            @input=${(e: InputEvent) => { this.signedBy = (e.target as HTMLInputElement).value; }}
                                            class="w-full bg-black/20 border border-white/10 p-3 rounded-lg text-white focus:outline-none focus:border-gable-green/50"
                                            placeholder="Received by..."
                                        />
                                    </div>
                                    <div>
                                        <div class="flex justify-between mb-2">
                                            <label class="text-xs font-mono uppercase text-zinc-500">Signature</label>
                                            <button @click=${() => this._clearSignature()} class="text-xs text-rose-400 font-medium hover:underline">Clear</button>
                                        </div>
                                        <div class="bg-white rounded-lg overflow-hidden h-48 touch-none border-2 border-dashed border-zinc-600 relative">
                                            <div class="absolute inset-0 flex items-center justify-center text-zinc-300 pointer-events-none opacity-20 text-3xl font-bold select-none">
                                                SIGN HERE
                                            </div>
                                            <canvas
                                                width="400"
                                                height="192"
                                                class="w-full h-full cursor-crosshair relative z-10"
                                                @mousedown=${(e: MouseEvent) => this._startDrawing(e)}
                                                @mousemove=${(e: MouseEvent) => this._draw(e)}
                                                @mouseup=${() => this._stopDrawing()}
                                                @mouseleave=${() => this._stopDrawing()}
                                                @touchstart=${(e: TouchEvent) => this._startDrawing(e)}
                                                @touchmove=${(e: TouchEvent) => this._draw(e)}
                                                @touchend=${() => this._stopDrawing()}
                                            ></canvas>
                                        </div>
                                    </div>
                                ` : nothing}

                                <button
                                    @click=${() => this._handleSubmit()}
                                    ?disabled=${this.isSubmitting || (this.status === 'DELIVERED' && !this.signedBy)}
                                    class="w-full h-12 shadow-glow font-bold text-lg bg-gable-green text-black rounded-xl hover:bg-gable-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    ${this.isSubmitting
                                        ? `Uploading ${this.podPhotos.length > 0 ? `${this.podPhotos.length} photos...` : '...'}`
                                        : 'Confirm Delivery'
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}
