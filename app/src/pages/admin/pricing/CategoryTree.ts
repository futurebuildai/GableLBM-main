import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons';
import { ChevronRight, ChevronDown, FolderTree } from 'lucide';
import type { ProductCategory } from '../../../types/category-pricing';
import { cn } from '../../../lib/utils';

/**
 * A single tree node (recursive). We register it as a separate element
 * so that each node manages its own expanded/collapsed state.
 */
@customElement('gable-category-node')
export class GableCategoryNode extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Object }) category!: ProductCategory;
  @property({ type: Number }) depth = 0;
  @property({ type: String, attribute: 'selected-id' }) selectedId: string | null = null;

  @state() private _expanded = true;

  private _handleClick() {
    this.dispatchEvent(new CustomEvent('category-select', {
      detail: this.category,
      bubbles: true,
      composed: true,
    }));
    const hasChildren = this.category.children && this.category.children.length > 0;
    if (hasChildren) {
      this._expanded = !this._expanded;
    }
  }

  render() {
    const cat = this.category;
    if (!cat) return nothing;

    const hasChildren = cat.children && cat.children.length > 0;
    const isSelected = this.selectedId === cat.id;

    return html`
      <div>
        <button
          @click=${this._handleClick}
          class=${cn(
            'w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors text-left',
            isSelected
              ? 'bg-gable-green/10 text-gable-green border border-gable-green/20'
              : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
          )}
          style="padding-left: ${12 + this.depth * 20}px"
        >
          ${hasChildren
            ? this._expanded
              ? icon(ChevronDown, 14, 'text-slate-500 shrink-0')
              : icon(ChevronRight, 14, 'text-slate-500 shrink-0')
            : html`<span class="w-[14px] shrink-0"></span>`
          }
          <span class="truncate">${cat.name}</span>
          ${this.depth === 0
            ? html`<span class="ml-auto text-[10px] text-slate-600 font-mono">${cat.path}</span>`
            : nothing
          }
        </button>
        ${hasChildren && this._expanded
          ? html`
            <div>
              ${cat.children!.map(child => html`
                <gable-category-node
                  .category=${child}
                  .depth=${this.depth + 1}
                  selected-id=${child.id === this.selectedId ? this.selectedId : (this.selectedId || '')}
                  .selectedId=${this.selectedId}
                ></gable-category-node>
              `)}
            </div>
          `
          : nothing
        }
      </div>
    `;
  }
}

@customElement('gable-category-tree')
export class GableCategoryTree extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Array }) categories: ProductCategory[] = [];
  @property({ type: String, attribute: 'selected-id' }) selectedId: string | null = null;

  render() {
    return html`
      <div class="space-y-1">
        <div class="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
          ${icon(FolderTree, 14)}
          Product Categories
        </div>
        <div class="space-y-0.5">
          ${this.categories.map(cat => html`
            <gable-category-node
              .category=${cat}
              .depth=${0}
              .selectedId=${this.selectedId}
            ></gable-category-node>
          `)}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-category-node': GableCategoryNode;
    'gable-category-tree': GableCategoryTree;
  }
}
