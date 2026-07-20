/**
 * Workspace tabs — the ERP shell's replacement for the left sidebar.
 *
 * Every route belongs to an app "zone" (longest-prefix match). Navigating
 * into a zone opens (or refocuses) that app's tab in the top tab strip;
 * navigation within the zone updates the tab's remembered path, so each
 * open module keeps its place. Home is pinned and always first. Open tabs
 * persist across reloads (keys + paths only; labels/icons re-derive from
 * the zone table so stale storage can't render garbage).
 *
 * Converted apps contribute zones from their manifests; unconverted
 * modules are mapped statically below and migrate into manifests as they
 * convert (docs/modularization-blueprint.md §5).
 */
import {
  House, LayoutDashboard, Package, FileText, ClipboardList, Receipt,
  BarChart3, Truck, ShoppingBag, Store, LayoutGrid, Users, BookOpen,
  Building2, Settings, CreditCard,
} from 'lucide';
import type { IconData } from '../apps/types.ts';
import { appManifests } from '../apps/registry.ts';
import { router } from './router.ts';

export interface AppZone {
  prefix: string;
  key: string;
  label: string;
  icon: IconData;
}

export interface WorkspaceTab {
  key: string;
  label: string;
  icon: IconData;
  path: string;
  pinned?: boolean;
}

const HOME_ZONE: AppZone = { prefix: '/home', key: 'home', label: 'Home', icon: House };

const staticZones: AppZone[] = [
  HOME_ZONE,
  { prefix: '/dashboard', key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { prefix: '/inventory', key: 'inventory', label: 'Inventory', icon: Package },
  { prefix: '/quotes', key: 'quote', label: 'Quotes', icon: FileText },
  { prefix: '/orders', key: 'order', label: 'Orders', icon: ClipboardList },
  { prefix: '/invoices', key: 'invoice', label: 'Invoicing', icon: Receipt },
  { prefix: '/reports/daily-till', key: 'pos', label: 'Daily Till', icon: CreditCard },
  { prefix: '/reports', key: 'reporting', label: 'Reporting', icon: BarChart3 },
  { prefix: '/dispatch', key: 'delivery', label: 'Logistics', icon: Truck },
  { prefix: '/fleet', key: 'delivery', label: 'Logistics', icon: Truck },
  { prefix: '/purchasing/vendors', key: 'vendor', label: 'Vendors', icon: Store },
  { prefix: '/purchasing', key: 'purchase_order', label: 'Purchasing', icon: ShoppingBag },
  { prefix: '/pricing', key: 'pricing', label: 'Pricing', icon: LayoutGrid },
  { prefix: '/accounts', key: 'customer', label: 'Customers', icon: Users },
  { prefix: '/accounting', key: 'gl', label: 'General Ledger', icon: BookOpen },
  { prefix: '/admin/branches', key: 'location', label: 'Branches', icon: Building2 },
  { prefix: '/admin', key: 'techadmin', label: 'Tech Admin', icon: Settings },
  { prefix: '/sales', key: 'quote', label: 'Quotes', icon: FileText },
];

/** Zones contributed by converted apps' manifests (first nav item wins). */
const manifestZones: AppZone[] = appManifests
  .filter((a) => a.nav.length > 0)
  .map((a) => {
    const nav = a.nav[0];
    const prefix = '/' + (nav.path.split('/')[1] ?? '');
    return { prefix, key: a.key, label: nav.label, icon: nav.icon };
  });

/** All zones, longest prefix first so specific paths win. */
const zones: AppZone[] = [...staticZones, ...manifestZones].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

export function zoneForPath(path: string): AppZone | null {
  for (const z of zones) {
    if (path === z.prefix || path.startsWith(z.prefix + '/')) return z;
  }
  return null;
}

function zoneForKey(key: string): AppZone | null {
  return zones.find((z) => z.key === key) ?? null;
}

const STORE_KEY = 'gable_workspace';

class WorkspaceService extends EventTarget {
  private _tabs: WorkspaceTab[] = [{ ...HOME_ZONE, path: '/home', pinned: true }];
  private _activeKey = 'home';

  get tabs(): WorkspaceTab[] {
    return this._tabs;
  }

  get activeKey(): string {
    return this._activeKey;
  }

  /** Rebuild persisted tabs (keys + paths only; visuals from the zone table). */
  restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { tabs?: { key: string; path: string }[] };
      for (const t of saved.tabs ?? []) {
        const zone = zoneForKey(t.key);
        if (!zone || t.key === 'home' || this._tabs.some((x) => x.key === t.key)) continue;
        this._tabs.push({ key: zone.key, label: zone.label, icon: zone.icon, path: t.path });
      }
    } catch {
      /* corrupt storage: start fresh */
    }
  }

  /** Route changed — open/refocus the owning app's tab and remember the path. */
  syncToPath(path: string) {
    const zone = zoneForPath(path);
    if (!zone) return;
    const existing = this._tabs.find((t) => t.key === zone.key);
    if (existing) {
      existing.path = path;
    } else {
      this._tabs.push({ key: zone.key, label: zone.label, icon: zone.icon, path });
    }
    this._activeKey = zone.key;
    this._persist();
    this.dispatchEvent(new CustomEvent('workspace-changed'));
  }

  /** Tab clicked — navigate to where that module was left. */
  activate(key: string) {
    const tab = this._tabs.find((t) => t.key === key);
    if (tab) router.navigate(tab.path);
  }

  /** Close a tab; if it was active, land on the neighbor (Home as floor). */
  close(key: string) {
    const idx = this._tabs.findIndex((t) => t.key === key);
    if (idx < 0 || this._tabs[idx].pinned) return;
    const wasActive = this._activeKey === key;
    this._tabs.splice(idx, 1);
    this._persist();
    if (wasActive) {
      const next = this._tabs[Math.min(idx, this._tabs.length - 1)] ?? this._tabs[0];
      router.navigate(next.path);
    } else {
      this.dispatchEvent(new CustomEvent('workspace-changed'));
    }
  }

  private _persist() {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ tabs: this._tabs.filter((t) => !t.pinned).map((t) => ({ key: t.key, path: t.path })) }),
    );
  }
}

export const workspace = new WorkspaceService();
