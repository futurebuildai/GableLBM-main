import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Delivery } from '../../types/delivery';

// Capture the HTML strings passed to Leaflet's bindPopup so we can assert escaping.
const hoisted = vi.hoisted(() => ({ popups: [] as string[] }));

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet', () => {
  const makeMarker = () => {
    const marker = {
      addTo: () => marker,
      bindPopup: (html: string) => { hoisted.popups.push(html); return marker; },
      on: () => marker,
      remove: () => undefined,
      getLatLng: () => ({ lat: 0, lng: 0 }),
      openPopup: () => undefined,
    };
    return marker;
  };
  const makePolyline = () => {
    const p = { addTo: () => p, remove: () => undefined };
    return p;
  };
  const L = {
    map: () => ({
      invalidateSize: () => undefined,
      fitBounds: () => undefined,
      panTo: () => undefined,
      closePopup: () => undefined,
      remove: () => undefined,
      setView: () => undefined,
      getContainer: () => ({ offsetWidth: 100 }),
    }),
    tileLayer: () => ({ addTo: () => undefined }),
    marker: makeMarker,
    polyline: makePolyline,
    latLngBounds: () => ({ isValid: () => true }),
    divIcon: () => ({}),
  };
  return { default: L };
});

import './RouteMap';

interface RouteMapEl extends HTMLElement {
  deliveries: Delivery[];
  updateComplete: Promise<unknown>;
}

async function flush(el: { updateComplete: Promise<unknown> }) {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await el.updateComplete;
  }
}

describe('gable-route-map', () => {
  beforeEach(() => {
    hoisted.popups.length = 0;
    document.body.innerHTML = '';
  });

  it('escapes server-supplied fields in marker popups (stored-XSS guard)', async () => {
    const el = document.createElement('gable-route-map') as unknown as RouteMapEl;
    document.body.appendChild(el);
    await flush(el);

    el.deliveries = [{
      id: 'd1', route_id: 'r1', order_id: 'o1', stop_sequence: 1, status: 'PENDING',
      created_at: '', updated_at: '',
      customer_name: '<img src=x onerror=alert(1)>',
      address: '<script>alert(2)</script>',
      order_number: '1001', latitude: 49.8, longitude: -119.5,
    }];
    await flush(el);

    const joined = hoisted.popups.join('\n');
    expect(joined.length).toBeGreaterThan(0);
    expect(joined).not.toContain('<img src=x onerror=');
    expect(joined).not.toContain('<script>');
    expect(joined).toContain('&lt;img');
  });
});
