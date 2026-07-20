/**
 * Frontend app-manifest types for the installable-apps platform.
 * See docs/modularization-blueprint.md §4.
 *
 * A converted app declares its routes and nav entries in ONE place
 * (app/src/apps/<key>.ts). The registry feeds them into the route table,
 * the path→tag resolution in app.ts, and the generated sidebar items —
 * retiring the old triple bookkeeping (routes.ts + _pathToTag + hardcoded
 * nav arrays) app by app.
 */
import type { RouteConfig } from '../lib/router.ts';
import type { createElement } from 'lucide';

export type IconData = Parameters<typeof createElement>[0];

export interface AppRoute {
  path: string;
  /** Custom element tag the page registers (replaces the app.ts tag map). */
  tag: string;
  load: () => Promise<unknown>;
  layout: RouteConfig['layout'];
}

/**
 * One entry in the app's menu. The first item doubles as the app's entry
 * point: the Home launcher tile and the workspace tab open it.
 */
export interface AppNavItem {
  label: string;
  path: string;
  icon: IconData;
  /** Sort order within the app's menu. */
  order: number;
}

export interface FrontendAppManifest {
  /** Must match the backend manifest key (internal/<module>/manifest.go). */
  key: string;
  name: string;
  routes: AppRoute[];
  nav: AppNavItem[];
}

/** One app's status as returned by GET /api/v1/apps. */
export interface AppInfo {
  key: string;
  name: string;
  summary: string;
  category: string;
  core: boolean;
  enabled: boolean;
  depends_on: string[] | null;
  orphaned?: boolean;
}
