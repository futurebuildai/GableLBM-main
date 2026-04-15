import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { Upload, Camera, Loader2 } from 'lucide';
import type { ParseResponse } from '../../types/parsing';
import { ParsingService } from '../../services/parsing.service';

@customElement('gable-material-list-upload')
export class GableMaterialListUpload extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean }) disabled = false;

  @state() private _uploading = false;
  @state() private _progress = 0;
  @state() private _error: string | null = null;

  private _fileInputEl: HTMLInputElement | null = null;
  private _progressInterval: ReturnType<typeof setInterval> | null = null;
  private _parseTimer: ReturnType<typeof setTimeout> | null = null;

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._progressInterval) clearInterval(this._progressInterval);
    if (this._parseTimer) clearTimeout(this._parseTimer);
  }

  private _handleClick() {
    if (!this._fileInputEl) {
      this._fileInputEl = this.querySelector('#material-list-upload-input') as HTMLInputElement;
    }
    this._fileInputEl?.click();
  }

  private async _handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this._uploading = true;
    this._error = null;
    this._progress = 0;

    this._progressInterval = setInterval(() => {
      this._progress = Math.min(this._progress + 15, 85);
    }, 200);

    try {
      const result: ParseResponse = await ParsingService.uploadMaterialList(file);
      this._progress = 100;
      clearInterval(this._progressInterval!);

      this._parseTimer = setTimeout(() => {
        this.dispatchEvent(new CustomEvent('parse-complete', { detail: result, bubbles: true, composed: true }));
        this._uploading = false;
        this._progress = 0;
      }, 300);
    } catch (err) {
      clearInterval(this._progressInterval!);
      this._error = err instanceof Error ? err.message : 'Failed to parse material list';
      this._uploading = false;
      this._progress = 0;
    }

    if (input) {
      input.value = '';
    }
  }

  render() {
    return html`
      <div class="inline-flex flex-col items-end gap-2">
        <input
          type="file"
          accept="image/*,.pdf,.xlsx,.xls,.csv"
          class="hidden"
          @change=${this._handleFileChange}
          id="material-list-upload-input"
          aria-label="Upload material list file"
        />

        <button
          @click=${this._handleClick}
          ?disabled=${this.disabled || this._uploading}
          class="relative overflow-hidden bg-slate-steel text-white hover:bg-slate-steel/80 border border-dashed border-gable-green/30 hover:border-gable-green/60 hover:bg-gable-green/5 transition-all inline-flex items-center justify-center rounded-lg text-sm font-medium h-10 py-2 px-4 disabled:opacity-50 disabled:pointer-events-none"
          id="upload-material-list-btn"
        >
          ${this._uploading ? html`
            <span class="mr-2 animate-spin inline-flex">${icon(Loader2, 16, 'text-gable-green')}</span>
            <span class="text-gable-green">Parsing...</span>
          ` : html`
            ${icon(Camera, 16, 'mr-1.5 text-gable-green')}
            ${icon(Upload, 14, 'mr-2 text-gable-green')}
            Upload Material List
          `}

          ${this._uploading ? html`
            <div
              class="absolute bottom-0 left-0 h-0.5 bg-gable-green transition-all duration-300 ease-out"
              style="width:${this._progress}%"
            ></div>
          ` : nothing}
        </button>

        ${this._error ? html`
          <div class="text-xs text-rose-400 max-w-60 text-right">${this._error}</div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-material-list-upload': GableMaterialListUpload;
  }
}
