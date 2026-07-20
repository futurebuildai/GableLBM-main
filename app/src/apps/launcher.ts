/**
 * ERP home launcher entries — which apps appear as tiles on the Home page's
 * Apps tab, and where tapping them lands.
 *
 * Names/categories/enablement come from the backend catalog
 * (GET /api/v1/apps); this map contributes only the frontend-known bits:
 * icon + entry path. Apps without an entry here (platform libraries,
 * modules whose UI lives inside another app's pages, other surfaces) simply
 * don't render as tiles. Converted apps' entries derive from their
 * manifests so the manifest stays the single source of truth.
 */
import {
  Package, FileText, ClipboardList, Receipt, BookOpen, Truck,
  Store, ShoppingBag, CreditCard, BarChart3, Users, Building2,
  LayoutGrid, Settings,
} from 'lucide';
import type { IconData } from './types.ts';
import { appManifests } from './registry.ts';

export interface LauncherEntry {
  icon: IconData;
  path: string;
}

const staticEntries: Record<string, LauncherEntry> = {
  // Catalog & Inventory
  inventory: { icon: Package, path: '/inventory' },
  location: { icon: Building2, path: '/admin/branches' },
  // Sales
  quote: { icon: FileText, path: '/quotes' },
  order: { icon: ClipboardList, path: '/orders' },
  pricing: { icon: LayoutGrid, path: '/pricing' },
  // Finance
  invoice: { icon: Receipt, path: '/invoices' },
  gl: { icon: BookOpen, path: '/accounting/chart-of-accounts' },
  // Purchasing
  purchase_order: { icon: ShoppingBag, path: '/purchasing' },
  vendor: { icon: Store, path: '/purchasing/vendors' },
  // Logistics
  delivery: { icon: Truck, path: '/dispatch' },
  // Front of House
  pos: { icon: CreditCard, path: '/pos' },
  reporting: { icon: BarChart3, path: '/reports/saved' },
  // CRM & People
  customer: { icon: Users, path: '/accounts' },
  // Platform
  techadmin: { icon: Settings, path: '/admin' },
};

/** Launcher entry for an app key, or null if the app has no home tile. */
export function launcherEntry(key: string): LauncherEntry | null {
  const manifest = appManifests.find((a) => a.key === key);
  if (manifest && manifest.nav.length > 0) {
    const nav = manifest.nav[0];
    return { icon: nav.icon, path: nav.path };
  }
  return staticEntries[key] ?? null;
}
