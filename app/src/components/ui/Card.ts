import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { cn } from '../../lib/utils';

@customElement('gable-card')
export class GableCard extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String }) variant: 'default' | 'glass' | 'interactive' = 'default';
  @property({ type: Boolean, attribute: 'no-padding' }) noPadding = false;
  @property({ type: String, attribute: 'class' }) className = '';

  private _variants: Record<string, string> = {
    default: 'bg-slate-steel border border-white/5 shadow-elevation-1',
    glass: 'bg-slate-steel/60 backdrop-blur-xl border border-white/5 shadow-elevation-1',
    interactive: 'bg-slate-steel/40 backdrop-blur-md border border-white/5 shadow-elevation-1 hover:shadow-elevation-3 hover:-translate-y-1 transition-all duration-300 cursor-pointer group hover:border-gable-green/30',
  };

  render() {
    return html`
      <div class="${cn(
        'rounded-2xl overflow-hidden',
        this._variants[this.variant],
        this.noPadding ? '' : 'p-6',
        this.className
      )}">
        <slot></slot>
      </div>
    `;
  }
}

@customElement('gable-card-header')
export class GableCardHeader extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String, attribute: 'class' }) className = '';

  render() {
    return html`
      <div class="${cn('flex flex-col space-y-1.5 p-6 pb-2', this.className)}">
        <slot></slot>
      </div>
    `;
  }
}

@customElement('gable-card-title')
export class GableCardTitle extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String, attribute: 'class' }) className = '';

  render() {
    return html`
      <h3 class="${cn('text-lg font-semibold leading-none tracking-tight text-white', this.className)}">
        <slot></slot>
      </h3>
    `;
  }
}

@customElement('gable-card-description')
export class GableCardDescription extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String, attribute: 'class' }) className = '';

  render() {
    return html`
      <p class="${cn('text-sm text-zinc-400', this.className)}">
        <slot></slot>
      </p>
    `;
  }
}

@customElement('gable-card-content')
export class GableCardContent extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String, attribute: 'class' }) className = '';

  render() {
    return html`
      <div class="${cn('p-6 pt-0', this.className)}">
        <slot></slot>
      </div>
    `;
  }
}

@customElement('gable-card-footer')
export class GableCardFooter extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String, attribute: 'class' }) className = '';

  render() {
    return html`
      <div class="${cn('flex items-center p-6 pt-0', this.className)}">
        <slot></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-card': GableCard;
    'gable-card-header': GableCardHeader;
    'gable-card-title': GableCardTitle;
    'gable-card-description': GableCardDescription;
    'gable-card-content': GableCardContent;
    'gable-card-footer': GableCardFooter;
  }
}
