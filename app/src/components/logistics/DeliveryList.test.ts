import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the data layer so the component never hits the network.
vi.mock('../../services/deliveryService', () => ({
  deliveryService: {
    listDeliveries: vi.fn(),
    reorderStops: vi.fn().mockResolvedValue(undefined),
    optimizeRoute: vi.fn().mockResolvedValue({ total_distance_miles: 0, total_duration_mins: 0 }),
    dispatchRoute: vi.fn().mockResolvedValue(undefined),
    completeRoute: vi.fn().mockResolvedValue(undefined),
  },
}));

import './DeliveryList';
import { deliveryService } from '../../services/deliveryService';
import type { Delivery } from '../../types/delivery';

interface DeliveryListEl extends HTMLElement {
  routeId: string | null;
  routeStatus?: string;
  selectedId: string | null;
  updateComplete: Promise<unknown>;
  scrollToSelected(): void;
}

const makeDelivery = (over: Partial<Delivery> = {}): Delivery => ({
  id: 'd1', route_id: 'r1', order_id: 'o1', stop_sequence: 1, status: 'PENDING',
  created_at: '', updated_at: '',
  customer_name: 'Acme', order_number: '1001', address: '1 Main St',
  latitude: 49.8, longitude: -119.5, ...over,
});

async function flush(el: { updateComplete: Promise<unknown> }) {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await el.updateComplete;
  }
}

async function mountWithDeliveries(deliveries: Delivery[]): Promise<DeliveryListEl> {
  vi.mocked(deliveryService.listDeliveries).mockResolvedValue(deliveries);
  const el = document.createElement('gable-delivery-list') as unknown as DeliveryListEl;
  el.routeStatus = 'SCHEDULED';
  document.body.appendChild(el);
  el.routeId = 'r1';
  await flush(el);
  return el;
}

describe('gable-delivery-list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    // jsdom has no layout engine; stub the scroll API the component calls.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('emits stop-select with the delivery id when a stop card is clicked', async () => {
    const el = await mountWithDeliveries([
      makeDelivery({ id: 'd1' }),
      makeDelivery({ id: 'd2', customer_name: 'Beta' }),
    ]);
    const detail = vi.fn();
    el.addEventListener('stop-select', (e) => detail((e as CustomEvent).detail));

    const btn = el.querySelector<HTMLButtonElement>('[aria-label^="Select stop 2"]');
    expect(btn).not.toBeNull();
    btn!.click();

    expect(detail).toHaveBeenCalledWith({ id: 'd2' });
  });

  it('does NOT emit stop-select when a reorder button is clicked', async () => {
    const el = await mountWithDeliveries([makeDelivery({ id: 'd1' }), makeDelivery({ id: 'd2' })]);
    const handler = vi.fn();
    el.addEventListener('stop-select', handler);

    // The second card's "Move up" button is enabled (index 1).
    const upButtons = el.querySelectorAll<HTMLButtonElement>('button[aria-label="Move up"]');
    expect(upButtons.length).toBe(2);
    upButtons[1].click();

    expect(handler).not.toHaveBeenCalled();
  });

  it('marks only the selected stop with aria-pressed=true', async () => {
    const el = await mountWithDeliveries([makeDelivery({ id: 'd1' }), makeDelivery({ id: 'd2' })]);
    el.selectedId = 'd2';
    await flush(el);

    const selected = el.querySelector<HTMLButtonElement>('[aria-label^="Select stop 2"]');
    const other = el.querySelector<HTMLButtonElement>('[aria-label^="Select stop 1"]');
    expect(selected!.getAttribute('aria-pressed')).toBe('true');
    expect(other!.getAttribute('aria-pressed')).toBe('false');
  });

  it('scrollToSelected scrolls the selected card into view, and is a no-op when nothing is selected', async () => {
    const el = await mountWithDeliveries([makeDelivery({ id: 'd1' }), makeDelivery({ id: 'd2' })]);

    el.scrollToSelected();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    el.selectedId = 'd2';
    await flush(el);
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    el.scrollToSelected();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
