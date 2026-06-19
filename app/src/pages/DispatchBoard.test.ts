import { describe, it, expect, beforeEach, vi } from 'vitest';

// Leaflet needs a real layout engine; stub it so RouteMap can mount under jsdom.
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet', () => {
  const mapStub = {
    invalidateSize: vi.fn(),
    fitBounds: vi.fn(),
    panTo: vi.fn(),
    closePopup: vi.fn(),
    remove: vi.fn(),
    setView: vi.fn(),
    getContainer: () => ({ offsetWidth: 0 }),
  };
  const L = {
    map: vi.fn(() => mapStub),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn(() => ({
      addTo: vi.fn().mockReturnThis(),
      bindPopup: vi.fn().mockReturnThis(),
      on: vi.fn(),
      remove: vi.fn(),
      getLatLng: vi.fn(() => ({ lat: 0, lng: 0 })),
      openPopup: vi.fn(),
    })),
    polyline: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
    latLngBounds: vi.fn(() => ({ isValid: () => true })),
    divIcon: vi.fn(() => ({})),
  };
  return { default: L };
});

vi.mock('../services/deliveryService', () => ({
  deliveryService: {
    listRoutes: vi.fn().mockResolvedValue([]),
    listDeliveries: vi.fn().mockResolvedValue([]),
  },
}));

import './DispatchBoard';

interface DispatchBoardEl extends HTMLElement {
  updateComplete: Promise<unknown>;
  _selectedDeliveryId: string | null;
  _activeTab: 'manifest' | 'map';
}

async function flush(el: { updateComplete: Promise<unknown> }) {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await el.updateComplete;
  }
}

function fireStopSelect(board: HTMLElement, id: string) {
  const list = board.querySelector('gable-delivery-list')!;
  list.dispatchEvent(new CustomEvent('stop-select', { detail: { id }, bubbles: true, composed: true }));
}

async function mountBoard(): Promise<DispatchBoardEl> {
  const el = document.createElement('gable-dispatch-board') as unknown as DispatchBoardEl;
  document.body.appendChild(el);
  await flush(el);
  return el;
}

describe('gable-dispatch-board', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('toggles the selected stop: a second select of the same id clears it', async () => {
    const el = await mountBoard();
    fireStopSelect(el, 'd9');
    await flush(el);
    expect(el._selectedDeliveryId).toBe('d9');

    fireStopSelect(el, 'd9');
    await flush(el);
    expect(el._selectedDeliveryId).toBeNull();
  });

  it('switching to a different stop replaces the selection', async () => {
    const el = await mountBoard();
    fireStopSelect(el, 'd1');
    await flush(el);
    fireStopSelect(el, 'd2');
    await flush(el);
    expect(el._selectedDeliveryId).toBe('d2');
  });

  it('selecting a different route clears the stop selection', async () => {
    const el = await mountBoard();
    fireStopSelect(el, 'd1');
    await flush(el);
    expect(el._selectedDeliveryId).toBe('d1');

    const routeList = el.querySelector('gable-route-list-component')!;
    routeList.dispatchEvent(new CustomEvent('select-route', {
      detail: { routeId: 'r2', vehicleId: 'v2', routeStatus: 'SCHEDULED' },
      bubbles: true,
      composed: true,
    }));
    await flush(el);
    expect(el._selectedDeliveryId).toBeNull();
  });

  it('clicking the Map tab activates it and toggles pane visibility', async () => {
    const el = await mountBoard();
    expect(el._activeTab).toBe('manifest');

    el.querySelector<HTMLButtonElement>('#dispatch-tab-map')!.click();
    await flush(el);

    expect(el._activeTab).toBe('map');
    expect(el.querySelector('#dispatch-panel-map')!.classList.contains('hidden')).toBe(false);
    expect(el.querySelector('#dispatch-panel-manifest')!.classList.contains('hidden')).toBe(true);
  });

  it('exposes accessible tab semantics (role=tab + aria-selected)', async () => {
    const el = await mountBoard();
    const manifestTab = el.querySelector('#dispatch-tab-manifest')!;
    const mapTab = el.querySelector('#dispatch-tab-map')!;
    expect(manifestTab.getAttribute('role')).toBe('tab');
    expect(manifestTab.getAttribute('aria-selected')).toBe('true');
    expect(mapTab.getAttribute('aria-selected')).toBe('false');
  });
});
