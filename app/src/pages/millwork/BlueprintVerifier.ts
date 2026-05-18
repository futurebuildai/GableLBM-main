import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { BlueprintScanResponse } from '../../types/configurator';
import { VisionService } from '../../services/VisionService';
import { icon } from '../../lib/icons.ts';
import { Upload, AlertTriangle, CheckCircle, Eye, FileText, Zap } from 'lucide';

const SAMPLE_BLUEPRINT = `STRUCTURAL FRAMING PLAN \u2014 LOT 42
Wall framing: 2x6 SYP #2 studs
Stud height: 10' stud walls
Spacing: 16" OC
Headers: 4x12 Douglas Fir Select Structural
Treated sill plate: 2x6 PT SYP
Roof rafters: 2x8 SPF #2 @ 24" OC`;

@customElement('gable-blueprint-verifier')
export class BlueprintVerifier extends LitElement {
  createRenderRoot() { return this; }

  @state() private _blueprintText = '';
  @state() private _configSelections: Record<string, string> = {
    Species: 'Douglas Fir',
    Grade: '#2',
    Treatment: 'None',
    Dimensions: '2x4-8',
  };
  @state() private _scanResult: BlueprintScanResponse | null = null;
  @state() private _scanning = false;
  @state() private _scanError: string | null = null;
  @state() private _dragOver = false;

  private async _handleScan() {
    if (!this._blueprintText.trim()) return;
    this._scanning = true;
    this._scanError = null;
    try {
      const result = await VisionService.scanBlueprint(this._blueprintText, this._configSelections);
      this._scanResult = result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Blueprint scan failed';
      this._scanError = message;
    } finally {
      this._scanning = false;
    }
  }

  private _loadSample() {
    this._blueprintText = SAMPLE_BLUEPRINT;
  }

  render() {
    return html`
      <div class="min-h-[calc(100vh-6rem)]">
        <!-- Header -->
        <div class="mb-8">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
              ${icon(Eye, 20, 'text-blue-400')}
            </div>
            <div>
              <h1 class="text-3xl font-bold text-white">Blueprint Verifier</h1>
              <span class="text-xs font-mono bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30">
                AI PROTOTYPE
              </span>
            </div>
          </div>
          <p class="text-gray-400 mt-1">
            Upload blueprint specs and compare against your configurator selections to identify mismatches
          </p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Left: Input Panel -->
          <div class="space-y-6">
            <!-- Blueprint Text Input -->
            <div class="bg-[#161821] border border-white/10 rounded-xl p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-white flex items-center gap-2">
                  ${icon(FileText, 18, 'text-blue-400')}
                  Blueprint Specifications
                </h3>
                <button
                  @click=${() => this._loadSample()}
                  class="text-xs text-[#00FFA3] hover:text-[#00FFA3]/80 font-medium transition-colors"
                >
                  Load Sample \u2192
                </button>
              </div>

              <!-- Drag & Drop Zone -->
              <div
                @dragover=${(e: DragEvent) => { e.preventDefault(); this._dragOver = true; }}
                @dragleave=${() => { this._dragOver = false; }}
                @drop=${(e: DragEvent) => { e.preventDefault(); this._dragOver = false; }}
                class="border-2 border-dashed rounded-xl p-4 mb-4 text-center transition-all ${this._dragOver
                  ? 'border-[#00FFA3] bg-[#00FFA3]/5'
                  : 'border-white/10 hover:border-white/20'
                }"
              >
                ${icon(Upload, 24, 'mx-auto text-gray-500 mb-2')}
                <div class="text-sm text-gray-400">
                  Drop a PDF or paste blueprint text below
                </div>
                <div class="text-xs text-gray-600 mt-1">
                  AI extraction from PDFs is a prototype \u2014 paste text for best results
                </div>
              </div>

              <textarea
                .value=${this._blueprintText}
                @input=${(e: Event) => { this._blueprintText = (e.target as HTMLTextAreaElement).value; }}
                placeholder="Paste blueprint specifications here..."
                rows="10"
                class="w-full bg-[#0A0B10] border border-white/10 rounded-lg p-4 text-sm font-mono text-gray-300 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none resize-none"
              ></textarea>
            </div>

            <!-- Current Config Selections -->
            <div class="bg-[#161821] border border-white/10 rounded-xl p-6">
              <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
                ${icon(Zap, 18, 'text-amber-400')}
                Configurator Selections (to compare against)
              </h3>
              <div class="grid grid-cols-2 gap-3">
                ${Object.entries(this._configSelections).map(([key, value]) => html`
                  <div>
                    <label class="text-xs text-gray-500 block mb-1">${key}</label>
                    <input
                      .value=${value}
                      @input=${(e: Event) => { this._configSelections = { ...this._configSelections, [key]: (e.target as HTMLInputElement).value }; }}
                      class="w-full bg-[#0A0B10] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00FFA3]/50 outline-none"
                    />
                  </div>
                `)}
              </div>
            </div>

            <!-- Scan Button -->
            <button
              @click=${() => this._handleScan()}
              ?disabled=${!this._blueprintText.trim() || this._scanning}
              class="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${this._blueprintText.trim() && !this._scanning
                ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:shadow-[0_0_30px_rgba(59,130,246,0.3)]'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }"
            >
              ${this._scanning ? html`
                <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Analyzing Blueprint...
              ` : html`
                ${icon(Eye, 20)}
                Scan &amp; Compare
              `}
            </button>

            ${this._scanError ? html`
              <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                ${icon(AlertTriangle, 18, 'text-red-400 shrink-0')}
                <span class="text-sm text-red-300">${this._scanError}</span>
              </div>
            ` : nothing}
          </div>

          <!-- Right: Results Panel -->
          <div class="space-y-6">
            ${this._scanResult ? this._renderResults() : this._renderEmptyState()}
          </div>
        </div>
      </div>
    `;
  }

  private _renderResults() {
    const result = this._scanResult!;
    return html`
      <div class="space-y-6">
        <!-- Summary -->
        <div class="p-6 rounded-xl border ${result.mismatches.length === 0
          ? 'bg-emerald-500/5 border-emerald-500/30'
          : 'bg-amber-500/5 border-amber-500/30'
        }">
          <div class="flex items-center gap-3 mb-2">
            ${result.mismatches.length === 0
              ? icon(CheckCircle, 24, 'text-emerald-400')
              : icon(AlertTriangle, 24, 'text-amber-400')
            }
            <span class="font-semibold text-white">${result.summary}</span>
          </div>
        </div>

        <!-- Extracted Dimensions -->
        <div class="bg-[#161821] border border-white/10 rounded-xl p-6">
          <h3 class="font-semibold text-white mb-4">Extracted Dimensions</h3>
          <div class="space-y-2">
            ${Object.entries(result.extracted_dimensions).map(([key, value]) => html`
              <div class="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                <span class="text-gray-400 text-sm capitalize">
                  ${key.replace(/_/g, ' ')}
                </span>
                <span class="font-mono text-white bg-blue-500/10 px-3 py-1 rounded border border-blue-500/20">
                  ${value}
                </span>
              </div>
            `)}
          </div>
        </div>

        <!-- Mismatches -->
        ${result.mismatches.length > 0 ? html`
          <div class="bg-[#161821] border border-white/10 rounded-xl p-6">
            <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
              ${icon(AlertTriangle, 18, 'text-amber-400')}
              Mismatches (${result.mismatches.length})
            </h3>
            <div class="space-y-3">
              ${result.mismatches.map((m) => html`
                <div class="p-4 rounded-lg border ${m.severity === 'error'
                  ? 'bg-red-500/5 border-red-500/30'
                  : 'bg-amber-500/5 border-amber-500/30'
                }">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-bold uppercase px-2 py-0.5 rounded ${m.severity === 'error'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-amber-500/20 text-amber-400'
                    }">
                      ${m.severity}
                    </span>
                    <span class="font-medium text-white">${m.field}</span>
                  </div>
                  <div class="text-sm text-gray-300 mb-3">${m.message}</div>
                  <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="bg-[#0A0B10] rounded p-2">
                      <div class="text-xs text-gray-500 mb-1">Blueprint</div>
                      <div class="font-mono text-blue-400">${m.blueprint_value}</div>
                    </div>
                    <div class="bg-[#0A0B10] rounded p-2">
                      <div class="text-xs text-gray-500 mb-1">Configurator</div>
                      <div class="font-mono text-amber-400">${m.config_value}</div>
                    </div>
                  </div>
                </div>
              `)}
            </div>
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderEmptyState() {
    return html`
      <div class="bg-[#161821] border border-white/10 rounded-xl p-12 text-center">
        <div class="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
          ${icon(Eye, 32, 'text-blue-400/50')}
        </div>
        <h3 class="text-lg font-semibold text-gray-400 mb-2">No Scan Results</h3>
        <p class="text-sm text-gray-600">
          Paste blueprint text and click "Scan &amp; Compare" to see mismatch analysis
        </p>
      </div>
    `;
  }
}
