import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * gable-exposure-line-cell — small inline cell rendered next to each quote
 * line on the editor when the line is tagged to a market index. Renders the
 * index code as a pill plus snapshot vs. current value + delta. Non-commodity
 * lines render nothing.
 */
@customElement('gable-exposure-line-cell')
export class GableExposureLineCell extends LitElement {
  createRenderRoot() { return this; }

  @property({ attribute: 'index-code' }) indexCode = '';
  @property({ type: Number, attribute: 'base-value' }) baseValue = 0;
  @property({ type: Number, attribute: 'current-value' }) currentValue = 0;
  @property({ type: Number, attribute: 'delta-pct' }) deltaPct = 0;
  @property({ type: Number, attribute: 'suggested-price' }) suggestedPrice = 0;
  @property({ attribute: 'unit' }) unit = 'MBF';

  render() {
    if (!this.indexCode) return nothing;
    const sign = this.deltaPct >= 0 ? '+' : '';
    const deltaCls = this.deltaPct === 0
      ? 'text-gray-400'
      : this.deltaPct > 0
        ? 'text-safety-red'
        : 'text-gable-green';

    return html`
      <div class="flex items-center gap-2 text-xs">
        <span class="px-1.5 py-0.5 rounded bg-blueprint-blue/15 text-blueprint-blue font-mono uppercase">
          ${this.indexCode}
        </span>
        ${this.baseValue > 0 ? html`
          <span class="font-mono text-gray-400">@ $${this.baseValue.toFixed(2)}</span>
          <span class="font-mono">now $${this.currentValue.toFixed(2)}</span>
          <span class="${deltaCls} font-mono">${sign}${this.deltaPct.toFixed(2)}%</span>
          ${this.suggestedPrice > 0 ? html`
            <span class="font-mono text-gray-400 italic">→ $${this.suggestedPrice.toFixed(4)}</span>
          ` : nothing}
        ` : nothing}
        <span class="text-gray-500">/ ${this.unit}</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-exposure-line-cell': GableExposureLineCell;
  }
}
