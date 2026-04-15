import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { cn } from '../../lib/utils.ts';

@customElement('gable-brand-logo')
export class GableBrandLogo extends LitElement {
  createRenderRoot() { return this; }

  @property() variant: 'full' | 'mark' | 'text' = 'full';
  @property() size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  @property({ attribute: 'class-name' }) className = '';

  private get _sizeClass() {
    return { sm: 'h-6', md: 'h-8', lg: 'h-12', xl: 'h-16' }[this.size];
  }

  render() {
    if (this.variant === 'mark') {
      return html`
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"
             class="${cn(this._sizeClass, 'w-auto', this.className)}">
          <path d="M4 36 L32 8 L60 36" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M32 16 V28" stroke="#00FFA3" stroke-width="4" stroke-linecap="round"/>
          <path d="M22 28 C22 28 22 46 32 46 C42 46 42 28 42 28" stroke="#00FFA3" stroke-width="4" stroke-linecap="round" fill="none"/>
          <rect x="28" y="46" width="8" height="6" rx="1" fill="#00FFA3"/>
          <circle cx="32" cy="32" r="16" fill="#00FFA3" fill-opacity="0.1"/>
        </svg>
      `;
    }

    if (this.variant === 'text') {
      return html`
        <div class="${cn('flex items-center gap-0.5', this.className)}">
          <span class="font-bold tracking-tight text-white">Gable</span>
          <span class="font-light tracking-widest text-gable-green">LBM</span>
        </div>
      `;
    }

    // Full variant
    const containerSize = { sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-12 h-12', xl: 'w-16 h-16' }[this.size];
    const textSize = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl', xl: 'text-4xl' }[this.size];

    return html`
      <div class="${cn('flex items-center gap-3 select-none', this.className)}">
        <div class="${cn('relative shrink-0 flex items-center justify-center', containerSize)}">
          <gable-brand-logo variant="mark" class-name="w-full h-full text-white"></gable-brand-logo>
        </div>
        <div class="${cn('flex items-baseline leading-none', textSize)}">
          <span class="font-bold tracking-tight text-white">Gable</span>
          <span class="font-light tracking-widest text-gable-green ml-0.5">LBM</span>
        </div>
      </div>
    `;
  }
}
