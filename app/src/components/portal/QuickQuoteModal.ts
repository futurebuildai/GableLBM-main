import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { X, Upload, Edit3, Mic, Check, Trash2, Plus, ArrowLeft, FileText } from 'lucide';

// Web Speech API type declarations
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
}

interface SpeechRecognitionConstructor {
    new(): SpeechRecognitionInstance;
}

declare global {
    interface Window {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }
}

type Step = 'method' | 'upload' | 'manual' | 'voice' | 'processing' | 'review' | 'success';

interface ParsedItem {
    description: string;
    quantity: number;
    uom: string;
}

@customElement('gable-quick-quote-modal')
export class QuickQuoteModal extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: Boolean }) open = false;

    @state() private step: Step = 'method';
    @state() private selectedFile: File | null = null;
    @state() private manualText = '';
    @state() private voiceTranscript = '';
    @state() private isRecording = false;
    @state() private parsedItems: ParsedItem[] = [];
    @state() private errorMessage = '';
    @state() private dragOver = false;
    @state() private project = '';
    @state() private submitting = false;

    private recognition: SpeechRecognitionInstance | null = null;

    private _close() {
        this.step = 'method';
        this.selectedFile = null;
        this.manualText = '';
        this.voiceTranscript = '';
        this.parsedItems = [];
        this.errorMessage = '';
        this.isRecording = false;
        this.project = '';
        this.submitting = false;
        this.recognition?.stop();
        this.open = false;
        this.dispatchEvent(new CustomEvent('close'));
    }

    // --- Step Navigation ---

    private _selectMethod(method: 'upload' | 'manual' | 'voice') {
        this.errorMessage = '';
        this.step = method;
    }

    private _goBack() {
        this.errorMessage = '';
        this.step = 'method';
    }

    // --- Upload ---

    private _handleDragOver(e: DragEvent) {
        e.preventDefault();
        this.dragOver = true;
    }

    private _handleDragLeave() {
        this.dragOver = false;
    }

    private _handleDrop(e: DragEvent) {
        e.preventDefault();
        this.dragOver = false;
        const file = e.dataTransfer?.files?.[0];
        if (file) this.selectedFile = file;
    }

    private _handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files?.[0]) {
            this.selectedFile = input.files[0];
        }
    }

    private async _processUpload() {
        if (!this.selectedFile) return;
        this.step = 'processing';
        this.errorMessage = '';

        // Mock: simulate parsing file into line items
        await new Promise(r => setTimeout(r, 2000));
        this.parsedItems = [
            { description: '2x4x8 SPF Stud Grade', quantity: 50, uom: 'EA' },
            { description: '2x6x12 Doug Fir #2', quantity: 25, uom: 'EA' },
            { description: 'OSB 7/16 4x8 Sheet', quantity: 30, uom: 'EA' },
            { description: 'CDX Plywood 1/2 4x8', quantity: 10, uom: 'EA' },
        ];
        this.step = 'review';
    }

    // --- Manual Entry ---

    private async _processManualText() {
        if (!this.manualText.trim()) return;
        this.step = 'processing';
        this.errorMessage = '';

        // Mock: simulate parsing text
        await new Promise(r => setTimeout(r, 1500));

        // Parse freeform text lines into items
        const lines = this.manualText.trim().split('\n').filter(l => l.trim());
        this.parsedItems = lines.map(line => {
            const qtyMatch = line.match(/^(\d+)\s*/);
            const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
            const desc = qtyMatch ? line.slice(qtyMatch[0].length).replace(/^[-–—·•]\s*/, '').trim() : line.trim();
            return { description: desc || line.trim(), quantity: qty, uom: 'EA' };
        });
        this.step = 'review';
    }

    // --- Voice ---

    private _toggleVoice() {
        if (this.isRecording) {
            this.recognition?.stop();
            this.isRecording = false;
            return;
        }

        const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognitionCtor) {
            this.errorMessage = 'Speech recognition is not supported in this browser. Please use Chrome.';
            return;
        }

        this.recognition = new SpeechRecognitionCtor();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            this.voiceTranscript = transcript;
        };

        this.recognition.onerror = () => {
            this.isRecording = false;
        };

        this.recognition.onend = () => {
            this.isRecording = false;
        };

        this.recognition.start();
        this.isRecording = true;
    }

    private async _processVoice() {
        if (!this.voiceTranscript.trim()) return;
        this.manualText = this.voiceTranscript;
        await this._processManualText();
    }

    // --- Review ---

    private _updateQuantity(index: number, value: string) {
        const num = parseFloat(value);
        if (!isNaN(num) && num > 0) {
            this.parsedItems = this.parsedItems.map((item, i) =>
                i === index ? { ...item, quantity: num } : item
            );
        }
    }

    private _updateDescription(index: number, value: string) {
        this.parsedItems = this.parsedItems.map((item, i) =>
            i === index ? { ...item, description: value } : item
        );
    }

    private _updateUOM(index: number, value: string) {
        this.parsedItems = this.parsedItems.map((item, i) =>
            i === index ? { ...item, uom: value } : item
        );
    }

    private _addItem() {
        this.parsedItems = [...this.parsedItems, { description: '', quantity: 1, uom: 'EA' }];
    }

    private _removeItem(index: number) {
        this.parsedItems = this.parsedItems.filter((_, i) => i !== index);
    }

    private async _submitQuote() {
        this.submitting = true;
        // Mock submit
        await new Promise(r => setTimeout(r, 1500));
        this.submitting = false;
        this.step = 'success';
        setTimeout(() => {
            this._close();
        }, 2500);
    }

    // --- Step Title ---

    private get _stepTitle(): string {
        switch (this.step) {
            case 'method': return 'Quick Quote';
            case 'upload': return 'Upload Material List';
            case 'manual': return 'Manual Entry';
            case 'voice': return 'Voice to Text';
            case 'processing': return 'Processing...';
            case 'review': return 'Review Items';
            case 'success': return 'Quote Submitted';
        }
    }

    // --- Render Step Content ---

    private _renderMethodStep() {
        return html`
            <div class="grid grid-cols-3 gap-4 p-6">
                <button
                    @click=${() => this._selectMethod('upload')}
                    class="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-white/[0.02] hover:border-gable-green hover:bg-gable-green/5 hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                    <div class="w-14 h-14 rounded-xl bg-gable-green/20 text-gable-green flex items-center justify-center">
                        ${icon(Upload, 24)}
                    </div>
                    <span class="font-semibold text-white">Upload List</span>
                    <span class="text-xs text-zinc-400">PDF, image, or spreadsheet</span>
                </button>

                <button
                    @click=${() => this._selectMethod('manual')}
                    class="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-white/[0.02] hover:border-gable-green hover:bg-gable-green/5 hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                    <div class="w-14 h-14 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                        ${icon(Edit3, 24)}
                    </div>
                    <span class="font-semibold text-white">Manual Entry</span>
                    <span class="text-xs text-zinc-400">Type or paste your list</span>
                </button>

                <button
                    @click=${() => this._selectMethod('voice')}
                    class="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-white/[0.02] hover:border-gable-green hover:bg-gable-green/5 hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                    <div class="w-14 h-14 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                        ${icon(Mic, 24)}
                    </div>
                    <span class="font-semibold text-white">Voice to Text</span>
                    <span class="text-xs text-zinc-400">Speak your material list</span>
                </button>
            </div>
        `;
    }

    private _renderUploadStep() {
        return html`
            <div class="p-6 space-y-4">
                <div
                    class="border-2 border-dashed ${this.dragOver ? 'border-gable-green bg-gable-green/5' : 'border-white/10'} rounded-xl p-10 text-center cursor-pointer transition-all hover:border-white/30"
                    @dragover=${this._handleDragOver}
                    @dragleave=${this._handleDragLeave}
                    @drop=${this._handleDrop}
                    @click=${() => (this.querySelector('#qq-file-input') as HTMLInputElement)?.click()}
                >
                    <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 text-zinc-400">
                        ${icon(Upload, 28)}
                    </div>
                    <p class="text-white font-medium mb-1">Drag and drop your file here, or click to browse</p>
                    <p class="text-xs text-zinc-500">Supports PDF, images (PNG, JPG), and spreadsheets (XLSX, XLS)</p>
                    <input
                        id="qq-file-input"
                        type="file"
                        accept=".pdf,.xls,.xlsx,.png,.jpg,.jpeg,.csv"
                        @change=${this._handleFileSelect}
                        hidden
                    />
                </div>

                ${this.selectedFile ? html`
                    <div class="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                        <div class="text-gable-green">${icon(FileText, 20)}</div>
                        <span class="flex-1 text-white text-sm font-medium truncate">${this.selectedFile.name}</span>
                        <span class="text-xs text-zinc-500 whitespace-nowrap">${(this.selectedFile.size / 1024).toFixed(1)} KB</span>
                    </div>
                ` : ''}

                ${this.errorMessage ? html`<div class="p-3 bg-red-500/10 text-red-400 rounded-lg text-sm">${this.errorMessage}</div>` : ''}
            </div>
            <div class="flex justify-between p-6 border-t border-white/10">
                <button @click=${this._goBack} class="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white transition-colors">
                    ${icon(ArrowLeft, 16)} Back
                </button>
                <button
                    @click=${this._processUpload}
                    ?disabled=${!this.selectedFile}
                    class="px-6 py-2 rounded-lg font-medium text-black bg-gable-green hover:bg-[#00e693] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    Process List
                </button>
            </div>
        `;
    }

    private _renderManualStep() {
        return html`
            <div class="p-6 space-y-4">
                <textarea
                    rows="8"
                    class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-gable-green transition-colors resize-none leading-relaxed"
                    placeholder="Type or paste your material list here...

Example:
50 - 2x4x8 SPF Stud
25 - 2x6x12 Doug Fir #2
30 - OSB 7/16 4x8
10 - CDX Plywood 1/2 4x8"
                    .value=${this.manualText}
                    @input=${(e: Event) => this.manualText = (e.target as HTMLTextAreaElement).value}
                ></textarea>

                ${this.errorMessage ? html`<div class="p-3 bg-red-500/10 text-red-400 rounded-lg text-sm">${this.errorMessage}</div>` : ''}
            </div>
            <div class="flex justify-between p-6 border-t border-white/10">
                <button @click=${this._goBack} class="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white transition-colors">
                    ${icon(ArrowLeft, 16)} Back
                </button>
                <button
                    @click=${this._processManualText}
                    ?disabled=${!this.manualText.trim()}
                    class="px-6 py-2 rounded-lg font-medium text-black bg-gable-green hover:bg-[#00e693] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    Process List
                </button>
            </div>
        `;
    }

    private _renderVoiceStep() {
        return html`
            <div class="p-6 space-y-6">
                <div class="flex flex-col items-center gap-4 py-4">
                    <button
                        class="w-20 h-20 rounded-full flex items-center justify-center transition-all ${this.isRecording
                            ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30'
                            : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white border border-white/10'}"
                        @click=${this._toggleVoice}
                    >
                        ${icon(Mic, 32)}
                    </button>
                    <span class="text-sm ${this.isRecording ? 'text-red-400 font-medium' : 'text-zinc-400'}">
                        ${this.isRecording ? 'Listening... Speak your material list' : 'Click the microphone to start'}
                    </span>
                </div>

                <textarea
                    rows="5"
                    class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-gable-green transition-colors resize-none"
                    placeholder="Your spoken text will appear here..."
                    .value=${this.voiceTranscript}
                    @input=${(e: Event) => this.voiceTranscript = (e.target as HTMLTextAreaElement).value}
                ></textarea>

                ${this.errorMessage ? html`<div class="p-3 bg-red-500/10 text-red-400 rounded-lg text-sm">${this.errorMessage}</div>` : ''}
            </div>
            <div class="flex justify-between p-6 border-t border-white/10">
                <button @click=${this._goBack} class="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white transition-colors">
                    ${icon(ArrowLeft, 16)} Back
                </button>
                <button
                    @click=${this._processVoice}
                    ?disabled=${!this.voiceTranscript.trim()}
                    class="px-6 py-2 rounded-lg font-medium text-black bg-gable-green hover:bg-[#00e693] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    Process List
                </button>
            </div>
        `;
    }

    private _renderProcessingStep() {
        return html`
            <div class="flex flex-col items-center justify-center gap-4 p-12">
                <div class="w-12 h-12 border-[3px] border-white/10 border-t-gable-green rounded-full animate-spin"></div>
                <p class="text-lg font-medium text-white">Analyzing your material list...</p>
                <p class="text-sm text-zinc-500">Matching items against the product catalog</p>
            </div>
        `;
    }

    private _renderReviewStep() {
        return html`
            <div class="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <!-- Project Name -->
                <div>
                    <label class="block text-sm font-medium text-zinc-300 mb-1">Project Name / PO</label>
                    <input
                        type="text"
                        .value=${this.project}
                        @input=${(e: Event) => this.project = (e.target as HTMLInputElement).value}
                        class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-gable-green transition-colors"
                        placeholder="e.g. 123 Main St Renovation"
                    />
                </div>

                <!-- Items Table -->
                <div class="rounded-xl border border-white/10 overflow-hidden">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="border-b border-white/10 bg-white/[0.02]">
                                <th class="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Description</th>
                                <th class="text-center px-3 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider w-20">Qty</th>
                                <th class="text-center px-3 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider w-24">UOM</th>
                                <th class="w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.parsedItems.map((item, index) => html`
                                <tr class="border-b border-white/5 hover:bg-white/[0.02]">
                                    <td class="px-4 py-2">
                                        <input
                                            type="text"
                                            .value=${item.description}
                                            @change=${(e: Event) => this._updateDescription(index, (e.target as HTMLInputElement).value)}
                                            class="w-full bg-transparent border-0 text-white text-sm focus:outline-none focus:ring-0 p-0"
                                            placeholder="Item description"
                                        />
                                    </td>
                                    <td class="px-3 py-2 text-center">
                                        <input
                                            type="number"
                                            .value=${String(item.quantity)}
                                            @change=${(e: Event) => this._updateQuantity(index, (e.target as HTMLInputElement).value)}
                                            min="1"
                                            class="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-gable-green"
                                        />
                                    </td>
                                    <td class="px-3 py-2 text-center">
                                        <select
                                            .value=${item.uom}
                                            @change=${(e: Event) => this._updateUOM(index, (e.target as HTMLSelectElement).value)}
                                            class="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-gable-green"
                                        >
                                            <option value="EA" ?selected=${item.uom === 'EA'}>EA</option>
                                            <option value="LF" ?selected=${item.uom === 'LF'}>LF</option>
                                            <option value="SF" ?selected=${item.uom === 'SF'}>SF</option>
                                            <option value="BF" ?selected=${item.uom === 'BF'}>BF</option>
                                            <option value="BDL" ?selected=${item.uom === 'BDL'}>BDL</option>
                                            <option value="PC" ?selected=${item.uom === 'PC'}>PC</option>
                                            <option value="RL" ?selected=${item.uom === 'RL'}>RL</option>
                                        </select>
                                    </td>
                                    <td class="px-2 py-2">
                                        <button
                                            @click=${() => this._removeItem(index)}
                                            class="p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
                                            title="Remove item"
                                        >
                                            ${icon(Trash2, 14)}
                                        </button>
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>

                <!-- Add Item -->
                <button
                    @click=${this._addItem}
                    class="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-white/10 rounded-lg text-zinc-400 hover:border-gable-green hover:text-gable-green transition-colors text-sm"
                >
                    ${icon(Plus, 14)} Add Item
                </button>

                <!-- Item Count -->
                <div class="text-right text-sm text-zinc-500">
                    ${this.parsedItems.length} item${this.parsedItems.length !== 1 ? 's' : ''}
                </div>

                <!-- Delivery Requirement -->
                <div>
                    <label class="block text-sm font-medium text-zinc-300 mb-1">Delivery Requirement</label>
                    <select class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-gable-green transition-colors">
                        <option value="asap">ASAP</option>
                        <option value="next_week">Next Week</option>
                        <option value="flexible">Flexible</option>
                    </select>
                </div>

                ${this.errorMessage ? html`<div class="p-3 bg-red-500/10 text-red-400 rounded-lg text-sm">${this.errorMessage}</div>` : ''}
            </div>
            <div class="flex justify-between p-6 border-t border-white/10">
                <button @click=${this._goBack} class="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white transition-colors">
                    ${icon(ArrowLeft, 16)} Start Over
                </button>
                <button
                    @click=${this._submitQuote}
                    ?disabled=${this.parsedItems.length === 0 || this.submitting}
                    class="px-6 py-2 rounded-lg font-medium text-black bg-gable-green hover:bg-[#00e693] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                    ${this.submitting ? html`<div class="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div> Submitting...` : 'Submit Quote Request'}
                </button>
            </div>
        `;
    }

    private _renderSuccessStep() {
        return html`
            <div class="flex flex-col items-center justify-center gap-4 p-12 text-center">
                <div class="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center">
                    ${icon(Check, 32)}
                </div>
                <h3 class="text-xl font-semibold text-white">Quote Submitted!</h3>
                <p class="text-zinc-400 max-w-xs">Your quote request has been submitted. Our team will review and get back to you shortly.</p>
            </div>
        `;
    }

    render() {
        if (!this.open) return html``;

        return html`
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click=${(e: Event) => { if (e.target === e.currentTarget) this._close(); }}>
                <div class="bg-[#161821] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-6 border-b border-white/10">
                        <h2 class="text-xl font-bold text-white flex items-center gap-2">
                            ${icon(FileText, 20, 'text-gable-green')} ${this._stepTitle}
                        </h2>
                        <button @click=${this._close} class="text-zinc-400 hover:text-white transition-colors">
                            ${icon(X, 20)}
                        </button>
                    </div>

                    <!-- Step Content -->
                    ${this.step === 'method' ? this._renderMethodStep() : ''}
                    ${this.step === 'upload' ? this._renderUploadStep() : ''}
                    ${this.step === 'manual' ? this._renderManualStep() : ''}
                    ${this.step === 'voice' ? this._renderVoiceStep() : ''}
                    ${this.step === 'processing' ? this._renderProcessingStep() : ''}
                    ${this.step === 'review' ? this._renderReviewStep() : ''}
                    ${this.step === 'success' ? this._renderSuccessStep() : ''}
                </div>
            </div>
        `;
    }
}
