/**
 * Icon helper — renders lucide icons as SVG strings for use in Lit templates.
 * Usage:
 *   import { icon } from '../../lib/icons';
 *   import { Package } from 'lucide';
 *   html`${icon(Package)}`
 */
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { createElement } from 'lucide';

/**
 * Render a lucide icon into a Lit template.
 * @param iconData  The icon import from 'lucide' (e.g. `Package`, `Truck`)
 * @param size      Pixel size (default 20)
 * @param cls       Extra CSS classes
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
  return unsafeHTML(el.outerHTML);
}
