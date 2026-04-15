import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { cn } from '../../lib/utils';

@customElement('gable-tooltip')
export class GableTooltip extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String }) content = '';
  @property({ type: String }) position: 'top' | 'bottom' | 'left' | 'right' = 'top';
  @property({ type: String, attribute: 'class' }) className = '';

  @state() private _isVisible = false;

  private _positionStyles(): Record<string, string> {
    const positions: Record<string, Record<string, string>> = {
      top: { bottom: '100%', left: '50%', transform: 'translateX(-50%) translateY(-8px)' },
      bottom: { top: '100%', left: '50%', transform: 'translateX(-50%) translateY(8px)' },
      left: { right: '100%', top: '50%', transform: 'translateY(-50%) translateX(-8px)' },
      right: { left: '100%', top: '50%', transform: 'translateY(-50%) translateX(8px)' },
    };
    return positions[this.position];
  }

  private _arrowClass(): string {
    const arrows: Record<string, string> = {
      top: 'bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r',
      bottom: 'top-[-5px] left-1/2 -translate-x-1/2 border-t border-l',
      left: 'right-[-5px] top-1/2 -translate-y-1/2 border-t border-r',
      right: 'left-[-5px] top-1/2 -translate-y-1/2 border-b border-l',
    };
    return arrows[this.position];
  }

  render() {
    const posStyles = this._positionStyles();
    const styleStr = Object.entries(posStyles).map(([k, v]) => `${k}:${v}`).join(';');

    return html`
      <div
        class="relative inline-block"
        @mouseenter=${() => this._isVisible = true}
        @mouseleave=${() => this._isVisible = false}
      >
        <slot></slot>
        ${this._isVisible ? html`
          <div
            class="${cn(
              'absolute z-50 px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 border border-white/10 rounded shadow-xl whitespace-nowrap pointer-events-none backdrop-blur-md',
              this.className
            )}"
            style="${styleStr}"
          >
            ${this.content}
            <div class="${cn('absolute w-2 h-2 bg-zinc-900 border-white/10 rotate-45', this._arrowClass())}"></div>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-tooltip': GableTooltip;
  }
}
