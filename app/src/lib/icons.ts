/**
 * Icon helper — renders lucide icons as SVG strings for use in Lit templates.
 * Usage:
 *   import { icon } from '../../lib/icons';
 *   import { Package } from 'lucide';
 *   html`${icon(Package)}`
 */
import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { createElement } from 'lucide';

/**
 * Render a lucide icon into a Lit template.
 * @param iconData  The icon import from 'lucide' (e.g. `Package`, `Truck`)
 * @param size      Pixel size (default 20)
 * @param cls       Extra CSS classes
 *
 * Returns a TemplateResult so the value is safe to pass through property
 * bindings (e.g. `.iconHtml=${icon(...)}`) — `unsafeHTML()` alone may only
 * be used in child bindings.
 */
export function icon(
  iconData: Parameters<typeof createElement>[0],
  size: number = 20,
  cls: string = ''
) {
  const el = createElement(iconData);
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  if (cls) el.setAttribute('class', cls);
  return html`${unsafeHTML(el.outerHTML)}`;
}
