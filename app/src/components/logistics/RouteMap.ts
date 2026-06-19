import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Delivery } from '../../types/delivery';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Escape server-supplied text before it goes into a raw Leaflet popup HTML string.
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
function esc(value: string | undefined | null): string {
  return (value ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

function makeStopIcon(index: number, status: string): L.DivIcon {
  const isDelivered = status === 'DELIVERED';
  const isFailed = status === 'FAILED' || status === 'PARTIAL';
  const bg = isDelivered ? '#10b981' : isFailed ? '#ef4444' : '#00FFA3';
  const text = isDelivered || isFailed ? '#fff' : '#000';
  const shadow = isDelivered ? 'rgba(16,185,129,0.5)' : isFailed ? 'rgba(239,68,68,0.4)' : 'rgba(0,255,163,0.5)';

  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${bg};color:${text};
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:12px;font-family:monospace;
      border:2px solid rgba(255,255,255,0.3);
      box-shadow:0 0 12px ${shadow}, 0 2px 6px rgba(0,0,0,0.4);
    ">${index + 1}</div>`,
  });
}

@customElement('gable-route-map')
export class GableRouteMap extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Array }) deliveries: Delivery[] = [];
  @property({ type: String, attribute: 'selected-id' }) selectedId: string | null = null;

  @state() private _mapContainerId = `route-map-${Math.random().toString(36).slice(2, 9)}`;

  private _map: L.Map | null = null;
  private _markers: L.Marker[] = [];
  private _markersById: Record<string, L.Marker> = {};
  private _polylines: L.Polyline[] = [];
  private _resizeObserver?: ResizeObserver;

  firstUpdated() {
    this._initMap();
    // Keep Leaflet's pixel size correct across container resizes: window resizes
    // and the 0x0 -> visible transition when this map's tab is opened.
    const container = this.querySelector(`#${this._mapContainerId}`) as HTMLElement | null;
    if (container && 'ResizeObserver' in window) {
      this._resizeObserver = new ResizeObserver(() => this._map?.invalidateSize());
      this._resizeObserver.observe(container);
    }
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('deliveries')) {
      this._updateMap();
    }
    if (changed.has('selectedId')) {
      this._highlightSelected();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
  }

  /**
   * Recompute the map's pixel size and refit the route. Leaflet initializes at
   * 0x0 while its container is inside a hidden tab, so call this whenever the
   * map pane becomes visible (e.g. on a Manifest -> Map tab switch).
   */
  refresh() {
    if (!this._map) return;
    this._map.invalidateSize();
    // Opening the map: focus the selected stop if there is one, else frame the route.
    if (this.selectedId && this._markersById[this.selectedId]) {
      this._highlightSelected();
    } else {
      this._fitToStops();
    }
  }

  private _fitToStops() {
    // Skip while the map is in a hidden tab (0x0); refresh() re-fits when shown.
    if (!this._map || this._map.getContainer().offsetWidth === 0) return;
    const valid = this.deliveries.filter(d => d.latitude != null && d.longitude != null);
    if (valid.length === 0) return;
    const bounds = L.latLngBounds(valid.map(d => [d.latitude!, d.longitude!] as L.LatLngExpression));
    if (bounds.isValid()) {
      this._map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  private _initMap() {
    const container = this.querySelector(`#${this._mapContainerId}`) as HTMLElement;
    if (!container) {
      console.error('[RouteMap] map container not found; map disabled');
      return;
    }

    // Default view centers on the demo's home region (Kelowna, BC). Once a
    // route with geocoded stops is selected, fitBounds (in _updateMap) overrides
    // this to frame the actual stops.
    this._map = L.map(container, {
      center: [49.888, -119.496],
      zoom: 11,
    });

    // Routes and stop coordinates are produced by OpenRouteService (VROOM
    // optimization + Pelias geocoding); tiles are OpenStreetMap. Both must be
    // credited per their ToS.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://openrouteservice.org/" target="_blank" rel="noopener noreferrer">openrouteservice.org</a> by HeiGIT | Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(this._map);

    this._updateMap();
  }

  private _updateMap() {
    if (!this._map) return;

    // Clear existing markers and polylines
    this._markers.forEach(m => m.remove());
    this._markers = [];
    this._markersById = {};
    this._polylines.forEach(p => p.remove());
    this._polylines = [];

    const validDeliveries = this.deliveries.filter(d => d.latitude != null && d.longitude != null);

    if (validDeliveries.length === 0) return;

    // Build route path
    const routePath: L.LatLngExpression[] = validDeliveries.map(d => [d.latitude!, d.longitude!]);

    // Draw polylines
    if (routePath.length >= 2) {
      // Glow line
      const glow = L.polyline(routePath, {
        color: '#00FFA3',
        weight: 6,
        opacity: 0.2,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(this._map);
      this._polylines.push(glow);

      // Main route line
      const main = L.polyline(routePath, {
        color: '#00FFA3',
        weight: 3,
        opacity: 0.8,
        dashArray: '8, 12',
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(this._map);
      this._polylines.push(main);
    }

    // Add markers
    validDeliveries.forEach((delivery, idx) => {
      const marker = L.marker([delivery.latitude!, delivery.longitude!], {
        icon: makeStopIcon(idx, delivery.status),
      }).addTo(this._map!);

      // Popup content is a raw HTML string (Leaflet sets innerHTML), so every
      // server-supplied field MUST be escaped to avoid stored XSS.
      marker.bindPopup(`
        <div style="font-weight:bold;display:flex;align-items:center;gap:8px">
          <span style="background:#00FFA3;color:#000;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${idx + 1}</span>
          ${esc(delivery.customer_name)}
        </div>
        <div style="font-size:12px;margin-top:4px">${esc(delivery.address)}</div>
        <div style="font-size:12px;color:#666;margin-top:4px">Order #${esc(delivery.order_number)} &middot; ${esc(delivery.status)}</div>
      `);

      marker.on('click', () => this._emitSelect(delivery.id));

      this._markers.push(marker);
      this._markersById[delivery.id] = marker;
    });

    this._fitToStops();
    this._highlightSelected();
  }

  private _emitSelect(id: string) {
    this.dispatchEvent(new CustomEvent('stop-select', { detail: { id }, bubbles: true, composed: true }));
  }

  /** Pan to + open the popup for the selected stop, or clear any open popup when nothing is selected. */
  private _highlightSelected() {
    if (!this._map) return;
    if (!this.selectedId) {
      this._map.closePopup();
      return;
    }
    const marker = this._markersById[this.selectedId];
    if (!marker) return;
    // Skip pan/popup while hidden (0x0); refresh() re-applies when the tab opens.
    if (this._map.getContainer().offsetWidth === 0) return;
    this._map.panTo(marker.getLatLng());
    marker.openPopup();
  }

  render() {
    return html`
      <div id="${this._mapContainerId}" style="height:100%;width:100%;background:#161821" class="z-0 [&_.leaflet-tile]:opacity-60 [&_.leaflet-tile]:saturate-0 [&_.leaflet-tile]:invert">
        ${this.deliveries.filter(d => d.latitude != null && d.longitude != null).length === 0 ? html`
          <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;z-index:1000;pointer-events:none">
            <div style="background:rgba(10,11,16,0.8);padding:12px 20px;border-radius:8px;color:#71717a;font-size:13px;border:1px solid rgba(255,255,255,0.05)">
              Select a route to view stops on the map
            </div>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-route-map': GableRouteMap;
  }
}
