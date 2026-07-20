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

export interface ZoneMenuItem {
  label: string;
  path: string;
  icon?: IconData;
}

export interface AppZone {
  prefix: string;
  key: string;
  label: string;
  icon: IconData;
  /** The app's menu, rendered in the shell's menu band while its tab is active. */
  menu?: ZoneMenuItem[];
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
  { prefix: '/inventory', key: 'inventory', label: 'Inventory', icon: Package, menu: [
    { label: 'The Pile', path: '/inventory' },
  ] },
  { prefix: '/quotes', key: 'quote', label: 'Quotes', icon: FileText, menu: [
    { label: 'Quotes', path: '/quotes' },
    { label: 'Quote Builder', path: '/quotes/new' },
    { label: 'Analytics', path: '/quotes/analytics' },
  ] },
  { prefix: '/orders', key: 'order', label: 'Orders', icon: ClipboardList, menu: [
    { label: 'Orders', path: '/orders' },
  ] },
  { prefix: '/invoices', key: 'invoice', label: 'Invoicing', icon: Receipt, menu: [
    { label: 'Invoices', path: '/invoices' },
  ] },
  { prefix: '/reports/daily-till', key: 'pos', label: 'Daily Till', icon: CreditCard, menu: [
    { label: 'Daily Till', path: '/reports/daily-till' },
    { label: 'POS Terminal', path: '/pos' },
  ] },
  { prefix: '/reports', key: 'reporting', label: 'Reporting', icon: BarChart3, menu: [
    { label: 'Saved Reports', path: '/reports/saved' },
    { label: 'Report Builder', path: '/reports/builder' },
    { label: 'AR Aging', path: '/reports/ar-aging' },
    { label: 'Customer Statement', path: '/reports/customer-statement' },
  ] },
  { prefix: '/dispatch', key: 'delivery', label: 'Logistics', icon: Truck, menu: [
    { label: 'Dispatch Board', path: '/dispatch' },
    { label: 'Fleet', path: '/fleet' },
  ] },
  { prefix: '/fleet', key: 'delivery', label: 'Logistics', icon: Truck, menu: [
    { label: 'Dispatch Board', path: '/dispatch' },
    { label: 'Fleet', path: '/fleet' },
  ] },
  { prefix: '/purchasing/vendors', key: 'vendor', label: 'Vendors', icon: Store, menu: [
    { label: 'Vendors', path: '/purchasing/vendors' },
  ] },
  { prefix: '/purchasing', key: 'purchase_order', label: 'Purchasing', icon: ShoppingBag, menu: [
    { label: 'Purchase Orders', path: '/purchasing' },
    { label: 'New PO', path: '/purchasing/new' },
  ] },
  { prefix: '/pricing', key: 'pricing', label: 'Pricing', icon: LayoutGrid, menu: [
    { label: 'Pricing Matrix', path: '/pricing' },
  ] },
  { prefix: '/accounts', key: 'customer', label: 'Customers', icon: Users, menu: [
    { label: 'Accounts', path: '/accounts' },
  ] },
  { prefix: '/accounting', key: 'gl', label: 'General Ledger', icon: BookOpen, menu: [
    { label: 'Chart of Accounts', path: '/accounting/chart-of-accounts' },
    { label: 'Journal Entries', path: '/accounting/journal-entries' },
    { label: 'Trial Balance', path: '/accounting/trial-balance' },
  ] },
  { prefix: '/admin/branches', key: 'location', label: 'Branches', icon: Building2, menu: [
    { label: 'Branches', path: '/admin/branches' },
  ] },
  { prefix: '/admin', key: 'techadmin', label: 'Tech Admin', icon: Settings, menu: [
    { label: 'Settings', path: '/admin' },
    { label: 'Apps', path: '/admin/apps' },
  ] },
  { prefix: '/sales', key: 'quote', label: 'Quotes', icon: FileText },
];

/**
 * Zones contributed by converted apps' manifests: the first nav item is the
 * app's entry point (tab label/icon come from the app itself), and the full
 * nav list becomes the app's menu.
 */
const manifestZones: AppZone[] = appManifests
  .filter((a) => a.nav.length > 0)
  .map((a) => {
    const nav = [...a.nav].sort((x, y) => x.order - y.order);
    const prefix = '/' + (nav[0].path.split('/')[1] ?? '');
    return {
      prefix,
      key: a.key,
      label: a.name,
      icon: nav[0].icon,
      menu: nav.map((n) => ({ label: n.label, path: n.path, icon: n.icon })),
    };
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

/** The active app's menu items (empty for zones without a menu, e.g. Home). */
export function menuForKey(key: string): ZoneMenuItem[] {
  return zoneForKey(key)?.menu ?? [];
}

/**
 * Which menu item is active for the current path — the longest item path
 * that prefixes it (so /accounting/journal-entries lights Journal Entries,
 * and /orders/:id keeps Orders lit).
 */
export function activeMenuPath(menu: ZoneMenuItem[], currentPath: string): string | null {
  let best: string | null = null;
  for (const item of menu) {
    if (currentPath === item.path || currentPath.startsWith(item.path + '/')) {
      if (best === null || item.path.length > best.length) best = item.path;
    }
  }
  return best;
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
