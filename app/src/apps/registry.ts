/**
 * Frontend app registry — aggregates the manifests of converted apps and
 * serves the three consumers that used to be hand-maintained in parallel:
 *
 *   1. the route table   → appRoutes() spread into routes.ts
 *   2. path→tag mapping  → tagForPath() consulted by app.ts before its
 *                          legacy hardcoded map
 *   3. sidebar items     → navItemsFor(section), filtered by enablement
 *
 * Enablement state comes from AppsService (GET /api/v1/apps) and fails open:
 * until the list loads, everything renders. The backend gate is the actual
 * enforcement; the frontend gate is UX.
 */
import type { RouteConfig } from '../lib/router.ts';
import type { AppNavItem, FrontendAppManifest, NavSection } from './types.ts';
import { appsService } from '../services/AppsService.ts';
import { millworkApp } from './millwork.ts';
import { governanceApp } from './governance.ts';

export const appManifests: FrontendAppManifest[] = [millworkApp, governanceApp];

const pathIndex = new Map<string, { app: FrontendAppManifest; tag: string }>();
for (const app of appManifests) {
  for (const route of app.routes) {
    pathIndex.set(route.path, { app, tag: route.tag });
  }
}

/** All converted apps' routes, in manifest order, for the route table. */
export function appRoutes(): RouteConfig[] {
  return appManifests.flatMap((app) =>
    app.routes.map(({ path, load, layout }) => ({ path, load, layout })),
  );
}

/** Custom-element tag for a route path owned by a converted app, else null. */
export function tagForPath(path: string): string | null {
  return pathIndex.get(path)?.tag ?? null;
}

/** App key owning a route path, else null. */
export function appKeyForPath(path: string): string | null {
  return pathIndex.get(path)?.app.key ?? null;
}

/**
 * Generated nav items for a sidebar section — only apps currently enabled
 * (fails open before the enablement list loads). Sorted by declared order.
 */
export function navItemsFor(section: NavSection): AppNavItem[] {
  return appManifests
    .filter((app) => appsService.isEnabled(app.key))
    .flatMap((app) => app.nav.filter((n) => n.section === section))
    .sort((a, b) => a.order - b.order);
}
