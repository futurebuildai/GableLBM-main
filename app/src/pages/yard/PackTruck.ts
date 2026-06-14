import { LitElement, html, nothing, svg, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2, Forklift, MapPin, Link2 } from 'lucide';
import { deliveryService } from '../../services/deliveryService';
import type { RouteManifest, PackStep, LoadManifest } from '../../types/delivery';

// Per-stop accent palette — matches AI_LM's planner so colors agree end to end.
const STOP_HEX = ['#00FFA3', '#38BDF8', '#FBBF24', '#A78BFA', '#F472B6', '#FB923C'];

function stopColor(seq: number | undefined): string {
    return STOP_HEX[((seq ?? 1) - 1) % STOP_HEX.length];
}

// A bundle: consecutive pack steps of the same SKU + order at one footprint.
interface PackGroup {
    sku: string;
    name: string;
    orderID?: string;
    stopSequence?: number;
    customer: string;
    steps: PackStep[];
    cols: number;
    layers: number;
    firstStep: number;
    lastStep: number;
    weightLbs: number;
}

/**
 * Step-by-step truck packing instructions for one route, driven by the AI_LM
 * load manifest: each bundle is one instruction card with top-down and side
 * views of the bed showing exactly where it lands.
 */
@customElement('gable-pack-truck')
export class PackTruck extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private data: RouteManifest | null = null;
    @state() private loading = true;
    @state() private groupIdx = 0;

    connectedCallback() {
        super.connectedCallback();
        this._load();
    }

    private async _load() {
        if (!this.routeId) return;
        try {
            this.data = await deliveryService.getRouteManifest(this.routeId);
        } catch {
            ToastService.show('Failed to load packing manifest', 'error');
        } finally {
            this.loading = false;
        }
    }

    private get _manifest(): LoadManifest | null {
        return this.data?.manifest ?? null;
    }

    private get _groups(): PackGroup[] {
        const m = this._manifest;
        if (!m) return [];
        const customers = new Map(m.stops.map((s) => [s.order_id, s.customer_name || '']));
        const groups: PackGroup[] = [];
        let cur: PackGroup | null = null;
        for (const st of m.steps) {
            if (!cur || cur.sku !== st.sku || cur.orderID !== st.order_id) {
                cur = {
                    sku: st.sku,
                    name: m.sku_names?.[st.sku] || '',
                    orderID: st.order_id,
                    stopSequence: st.stop_sequence,
                    customer: customers.get(st.order_id || '') || '',
                    steps: [],
                    cols: 0,
                    layers: 0,
                    firstStep: st.step,
                    lastStep: st.step,
                    weightLbs: 0,
                };
                groups.push(cur);
            }
            cur.steps.push(st);
            cur.lastStep = st.step;
            cur.weightLbs += st.weight_lbs;
        }
        for (const g of groups) {
            g.cols = new Set(g.steps.map((s) => s.y.toFixed(2))).size;
            g.layers = new Set(g.steps.map((s) => s.z.toFixed(2))).size;
        }
        return groups;
    }

    // Human-readable bed position for a bundle: thirds along length and width.
    private _positionText(g: PackGroup): string {
        const m = this._manifest!;
        const bedL = m.bed?.length_in || 1;
        const bedW = m.bed?.width_in || 1;
        const cx = g.steps.reduce((s, p) => s + p.x + p.length_in / 2, 0) / g.steps.length;
        const cy = g.steps.reduce((s, p) => s + p.y + p.width_in / 2, 0) / g.steps.length;
        const along = cx < bedL / 3 ? 'NOSE (front)' : cx < (2 * bedL) / 3 ? 'MIDDLE of bed' : 'REAR (tail)';
        const across = cy < bedW / 3 ? 'driver side' : cy < (2 * bedW) / 3 ? 'centered' : 'passenger side';
        return `${along} · ${across}`;
    }

    private _svgViews(current: PackGroup | null): TemplateResult {
        const m = this._manifest!;
        const bedL = m.bed?.length_in || 288;
        const bedW = m.bed?.width_in || 96;
        const bedH = Math.max(m.max_load_height_in + 10, 60);
        const lastVisible = current ? current.lastStep : Infinity;
        const curRange = current ? [current.firstStep, current.lastStep] : [-1, -1];

        const W = 340;
        const topH = (bedW / bedL) * W;
        const sideH = (bedH / bedL) * W;

        const rect = (p: PackStep, view: 'top' | 'side') => {
            if (p.step > lastVisible) return nothing;
            const isCur = p.step >= curRange[0] && p.step <= curRange[1];
            const fill = isCur ? '#00FFA3' : stopColor(p.stop_sequence);
            const opacity = isCur ? 0.95 : 0.4;
            const sx = (p.x / bedL) * W;
            const sw = (p.length_in / bedL) * W;
            if (view === 'top') {
                const sy = (p.y / bedW) * topH;
                const sh = (p.width_in / bedW) * topH;
                return svg`<rect x=${sx} y=${sy} width=${Math.max(sw, 1)} height=${Math.max(sh, 0.8)} fill=${fill} fill-opacity=${opacity} stroke="#0A0B10" stroke-width="0.4" />`;
            }
            const sy = sideH - ((p.z + p.height_in) / bedH) * sideH;
            const sh = (p.height_in / bedH) * sideH;
            return svg`<rect x=${sx} y=${sy} width=${Math.max(sw, 1)} height=${Math.max(sh, 0.8)} fill=${fill} fill-opacity=${opacity} stroke="#0A0B10" stroke-width="0.4" />`;
        };

        const showStraps = !current; // straps go on after the last bundle
        const straps = showStraps ? this._manifest!.securement?.straps ?? [] : [];

        return html`
            <div class="space-y-3">
                <div>
                    <div class="flex justify-between text-[10px] font-mono text-zinc-500 mb-1">
                        <span>TOP VIEW · NOSE ◀</span><span>▶ TAIL</span>
                    </div>
                    <svg viewBox="0 0 ${W} ${topH}" class="w-full rounded-lg border border-white/10 bg-[#0F1016]">
                        <rect x="0" y="0" width=${W} height=${topH} fill="#13141B" />
                        ${this._manifest!.steps.map((p) => rect(p, 'top'))}
                        ${straps.map((st) => {
                            const sx = (st.position_in / bedL) * W;
                            return svg`
                                <line x1=${sx} y1="0" x2=${sx} y2=${topH} stroke="#F59E0B" stroke-width="2.5" stroke-dasharray="4 3" />
                                <circle cx=${sx} cy="7" r="6" fill="#F59E0B" />
                                <text x=${sx} y="10" text-anchor="middle" font-size="8" font-family="JetBrains Mono, monospace" font-weight="700" fill="#0A0B10">${st.number}</text>
                            `;
                        })}
                    </svg>
                </div>
                <div>
                    <div class="flex justify-between text-[10px] font-mono text-zinc-500 mb-1">
                        <span>SIDE VIEW · NOSE ◀</span><span>▶ TAIL</span>
                    </div>
                    <svg viewBox="0 0 ${W} ${sideH}" class="w-full rounded-lg border border-white/10 bg-[#0F1016]">
                        <rect x="0" y="0" width=${W} height=${sideH} fill="#13141B" />
                        <line x1="0" y1=${sideH - 0.5} x2=${W} y2=${sideH - 0.5} stroke="#3F3F46" stroke-width="1" />
                        ${this._manifest!.steps.map((p) => rect(p, 'side'))}
                    </svg>
                </div>
            </div>
        `;
    }

    render() {
        if (this.loading) {
            return html`<div class="flex justify-center items-center h-64">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div>
            </div>`;
        }
        const m = this._manifest;
        if (!this.data || !m || m.steps.length === 0) {
            return html`<div class="text-center py-16 px-4 max-w-md mx-auto">
                <p class="text-zinc-400">No packing manifest on this route.</p>
                <button @click=${() => router.navigate('/yard/loading')} class="text-amber-400 hover:underline mt-4 text-sm">
                    Back to Pack Trucks
                </button>
            </div>`;
        }

        const groups = this._groups;
        const done = this.groupIdx >= groups.length;
        const g = done ? null : groups[this.groupIdx];
        const placedPieces = done ? m.steps.length : g ? g.firstStep - 1 : 0;
        const packOrderStops = [...m.stops].sort((a, b) => b.sequence - a.sequence);

        return html`
            <div class="flex flex-col space-y-4 p-4 max-w-md mx-auto pb-24">
                <div class="flex items-center gap-3">
                    <button
                        @click=${() => router.navigate('/yard/loading')}
                        class="p-2 rounded-lg hover:bg-white/5 text-zinc-400" aria-label="Back"
                    >${icon(ArrowLeft, 20)}</button>
                    <div class="flex-1 min-w-0">
                        <h1 class="text-lg font-bold text-white truncate flex items-center gap-2">
                            ${icon(Forklift, 18, 'text-amber-400')} ${m.vehicle_name}
                        </h1>
                        <p class="text-xs font-mono text-zinc-500">
                            ${m.plan_date} · ${m.total_weight_lbs.toLocaleString()} lb · ${m.steps.length} pcs
                        </p>
                    </div>
                    <span class="text-[10px] font-mono px-2 py-1 rounded border ${m.gvw_status === 'PASS'
                        ? 'text-emerald-400 border-emerald-400/40'
                        : 'text-amber-400 border-amber-400/40'}">GVW ${m.gvw_status}</span>
                </div>

                <!-- Load order: last stop packs first -->
                <div class="rounded-xl border border-white/5 bg-[#161821] p-3">
                    <p class="text-[10px] font-mono text-zinc-500 uppercase mb-2">Load order (last delivery loads first)</p>
                    <div class="flex flex-wrap items-center gap-1.5 text-xs">
                        ${packOrderStops.map(
                            (s, i) => html`
                                <span class="flex items-center gap-1.5 px-2 py-1 rounded-full border border-white/10">
                                    <span class="h-4 w-4 rounded-full text-[10px] font-mono font-bold flex items-center justify-center text-black" style="background:${stopColor(s.sequence)}">${s.sequence}</span>
                                    <span class="text-zinc-300">${s.customer_name || s.order_id.slice(-6)}</span>
                                </span>
                                ${i < packOrderStops.length - 1 ? html`<span class="text-zinc-600">→</span>` : nothing}
                            `,
                        )}
                    </div>
                </div>

                <!-- Progress -->
                <div>
                    <div class="flex justify-between text-[10px] font-mono text-zinc-500 mb-1">
                        <span>PROGRESS</span><span>${placedPieces} / ${m.steps.length} pcs</span>
                    </div>
                    <div class="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div class="h-full bg-amber-400 transition-all" style="width:${(placedPieces / m.steps.length) * 100}%"></div>
                    </div>
                </div>

                ${done
                    ? html`<div class="space-y-4">
                          <div class="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-center space-y-1">
                              ${icon(CheckCircle2, 36, 'text-emerald-400 mx-auto')}
                              <p class="text-lg font-bold text-white">All bundles placed</p>
                              <p class="text-sm text-zinc-400">
                                  ${m.steps.length} pieces · ${m.total_weight_lbs.toLocaleString()} lb
                              </p>
                          </div>
                          ${m.securement
                              ? html`<div class="rounded-2xl border border-amber-400/30 bg-[#161821] p-4 space-y-3">
                                    <p class="text-sm font-bold text-amber-400 flex items-center gap-2">
                                        ${icon(Link2, 16)} SECURE THE LOAD — ${m.securement.straps.length} tie-downs
                                    </p>
                                    <p class="text-xs text-zinc-400">
                                        Use ${m.securement.recommended_strap}. Strap positions are marked
                                        <span class="text-amber-400 font-mono">1–${m.securement.straps.length}</span> on the top view below.
                                    </p>
                                    <div class="space-y-1.5">
                                        ${m.securement.straps.map(
                                            (st) => html`
                                                <div class="flex items-center gap-2 text-xs">
                                                    <span class="h-5 w-5 shrink-0 rounded-full bg-amber-400 text-black font-mono font-bold flex items-center justify-center">${st.number}</span>
                                                    <span class="text-zinc-200 flex-1">${(st.position_in / 12).toFixed(1)} ft from nose</span>
                                                    <span class="font-mono text-zinc-500">over ${st.over_height_in.toFixed(0)}″ · WLL ${st.required_wll_lbs.toLocaleString()} lb</span>
                                                </div>
                                            `,
                                        )}
                                    </div>
                                    <ul class="space-y-1 text-[11px] text-zinc-500 list-disc list-inside border-t border-white/5 pt-2">
                                        ${m.securement.notes.map((n) => html`<li>${n}</li>`)}
                                    </ul>
                                </div>`
                              : nothing}
                      </div>`
                    : html`
                          <!-- Current bundle instruction -->
                          <div class="rounded-2xl border border-amber-400/30 bg-[#161821] p-4 space-y-3">
                              <div class="flex items-center justify-between">
                                  <span class="text-[10px] font-mono text-zinc-500 uppercase">
                                      Bundle ${this.groupIdx + 1} of ${groups.length}
                                  </span>
                                  <span class="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border border-white/10">
                                      <span class="h-4 w-4 rounded-full text-[10px] font-mono font-bold flex items-center justify-center text-black" style="background:${stopColor(g!.stopSequence)}">${g!.stopSequence ?? '—'}</span>
                                      <span class="text-zinc-300 truncate max-w-[140px]">${g!.customer || 'Stop'}</span>
                                  </span>
                              </div>
                              <div>
                                  <p class="text-2xl font-bold text-white font-mono">${g!.steps.length} × ${g!.sku}</p>
                                  ${g!.name ? html`<p class="text-sm text-zinc-400">${g!.name}</p>` : nothing}
                              </div>
                              <div class="grid grid-cols-3 gap-2 text-center">
                                  <div class="rounded-lg bg-white/5 py-2">
                                      <p class="text-[10px] text-zinc-500 uppercase">Stack</p>
                                      <p class="font-mono text-sm text-white">${g!.cols} wide × ${g!.layers} high</p>
                                  </div>
                                  <div class="rounded-lg bg-white/5 py-2">
                                      <p class="text-[10px] text-zinc-500 uppercase">Weight</p>
                                      <p class="font-mono text-sm text-white">${Math.round(g!.weightLbs).toLocaleString()} lb</p>
                                  </div>
                                  <div class="rounded-lg bg-white/5 py-2">
                                      <p class="text-[10px] text-zinc-500 uppercase">Pieces</p>
                                      <p class="font-mono text-sm text-white">#${g!.firstStep}–${g!.lastStep}</p>
                                  </div>
                              </div>
                              <p class="flex items-center gap-2 text-sm text-amber-400 font-medium">
                                  ${icon(MapPin, 16)} ${this._positionText(g!)}
                              </p>
                          </div>
                      `}

                ${this._svgViews(g)}

                <!-- Nav buttons -->
                <div class="fixed bottom-16 left-0 right-0 md:max-w-md md:mx-auto px-4 py-3 bg-[#0A0B10]/95 backdrop-blur-md border-t border-white/10 flex gap-3">
                    <button
                        @click=${() => { if (this.groupIdx > 0) this.groupIdx -= 1; }}
                        ?disabled=${this.groupIdx === 0}
                        class="flex-1 h-12 rounded-xl border border-white/10 text-zinc-300 font-bold flex items-center justify-center gap-2 disabled:opacity-30 active:scale-[0.98]"
                    >
                        ${icon(ChevronLeft, 18)} BACK
                    </button>
                    <button
                        @click=${() => { if (this.groupIdx < groups.length) this.groupIdx += 1; }}
                        ?disabled=${done}
                        class="flex-[2] h-12 rounded-xl bg-amber-400 text-black font-bold flex items-center justify-center gap-2 disabled:opacity-30 active:scale-[0.98]"
                    >
                        ${this.groupIdx === groups.length - 1 ? 'FINISH' : 'PLACED — NEXT'} ${icon(ChevronRight, 18)}
                    </button>
                </div>
            </div>
        `;
    }
}
