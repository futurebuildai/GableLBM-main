/**
 * AppsService — enablement state for the installable-apps platform.
 *
 * Fetches GET /api/v1/apps once per session (any authenticated role),
 * caches in memory, and emits 'apps-changed' after loads and toggles so
 * nav/pages re-render. Fails open: unknown keys and unloaded state count as
 * enabled — the backend route gate is the enforcement layer.
 */
import { fetchWithAuth } from './fetchClient';
import type { AppInfo } from '../apps/types.ts';

const API_URL = import.meta.env.VITE_API_URL || '';

export class AppToggleError extends Error {
  blockers: string[];
  constructor(message: string, blockers: string[] = []) {
    super(message);
    this.name = 'AppToggleError';
    this.blockers = blockers;
  }
}

class AppsServiceImpl extends EventTarget {
  private _apps: AppInfo[] | null = null;
  private _inflight: Promise<AppInfo[]> | null = null;

  /** Last-loaded catalog (empty until load() resolves). */
  get apps(): AppInfo[] {
    return this._apps ?? [];
  }

  get loaded(): boolean {
    return this._apps !== null;
  }

  /** Whether an app is enabled. Fails open before load and for unknown keys. */
  isEnabled(key: string): boolean {
    const app = this._apps?.find((a) => a.key === key);
    return app ? app.enabled : true;
  }

  /** Load (or reload) the catalog. Concurrent calls share one request. */
  async load(force = false): Promise<AppInfo[]> {
    if (this._apps && !force) return this._apps;
    if (this._inflight) return this._inflight;
    this._inflight = (async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/v1/apps`);
        if (!res.ok) throw new Error(`Failed to load apps (${res.status})`);
        const data = await res.json();
        const next = (data.apps ?? []) as AppInfo[];
        // Only announce real changes — listeners re-render (and pages may
        // reload on mount), so dispatching identical state would loop.
        const changed = JSON.stringify(next) !== JSON.stringify(this._apps);
        this._apps = next;
        if (changed) {
          this.dispatchEvent(new CustomEvent('apps-changed', { detail: this._apps }));
        }
        return this._apps;
      } finally {
        this._inflight = null;
      }
    })();
    return this._inflight;
  }

  /** Enable/disable an app. Throws AppToggleError on dependency conflicts. */
  async toggle(key: string, enabled: boolean): Promise<AppInfo[]> {
    const res = await fetchWithAuth(
      `${API_URL}/api/v1/apps/${encodeURIComponent(key)}/${enabled ? 'enable' : 'disable'}`,
      { method: 'POST' },
    );
    if (!res.ok) {
      let message = `Failed to ${enabled ? 'enable' : 'disable'} ${key}`;
      let blockers: string[] = [];
      try {
        const body = await res.json();
        if (body?.error?.message) message = body.error.message;
        if (Array.isArray(body?.error?.blockers)) blockers = body.error.blockers;
      } catch {
        // non-JSON error body; keep the generic message
      }
      throw new AppToggleError(message, blockers);
    }
    const data = await res.json();
    this._apps = (data.apps ?? []) as AppInfo[];
    this.dispatchEvent(new CustomEvent('apps-changed', { detail: this._apps }));
    return this._apps;
  }
}

export const appsService = new AppsServiceImpl();
