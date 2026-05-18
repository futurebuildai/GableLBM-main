import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { cn } from '../../lib/utils';
import { icon } from '../../lib/icons';
import { Loader2 } from 'lucide';
import { buttonVariants } from './button-variants';

@customElement('gable-button')
export class GableButton extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String }) variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'premium' = 'default';
  @property({ type: String }) size: 'default' | 'sm' | 'lg' | 'icon' = 'default';
  @property({ type: Boolean, attribute: 'is-loading' }) isLoading = false;
  @property({ type: Boolean }) disabled = false;
  @property({ type: String }) type: 'button' | 'submit' | 'reset' = 'button';
  @property({ type: String, attribute: 'class' }) className = '';

  render() {
    return html`
      <button
        type="${this.type}"
        class="${cn(buttonVariants({ variant: this.variant, size: this.size, className: this.className }))}"
        ?disabled=${this.isLoading || this.disabled}
        @click=${this._handleClick}
      >
        ${this.isLoading ? html`<span class="mr-2 h-4 w-4 animate-spin inline-flex">${icon(Loader2, 16)}</span>` : nothing}
        <slot></slot>
      </button>
    `;
  }

  private _handleClick(e: Event) {
    if (this.isLoading || this.disabled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-button': GableButton;
  }
}
