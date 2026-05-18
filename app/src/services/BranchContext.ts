/**
 * BranchContext — global state for the user's currently selected branch.
 *
 * - Initialized at app boot from GET /api/v1/me/branches.
 * - Persists the selected branch id in localStorage so subsequent requests
 *   carry the X-Branch-Id header (set by `fetchClient.ts`).
 * - Emits 'branch-changed' on itself and 'gable:branch-changed' on window
 *   so pages can re-fetch their data on switch.
 *
 * Reads from localStorage in `fetchClient.ts` (not from this singleton) to
 * avoid a circular import between the two modules.
 */
import type { BranchSummary } from '../types/location';
import { LocationService } from './LocationService';

const STORAGE_KEY = 'gable_current_branch_id';

export interface BranchChangedDetail {
  branchId: string | null;
  branch: BranchSummary | null;
}

class BranchContextService extends EventTarget {
  private _branches: BranchSummary[] = [];
  private _currentId: string | null = null;
  private _initialized = false;
  private _initPromise: Promise<void> | null = null;

  /**
   * Loads the user's branches and selects the home branch (or first), or
   * restores a previously selected branch if it is still in the list.
   * Safe to call multiple times — returns the same in-flight promise.
   */
  init(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  }

  private async _doInit(): Promise<void> {
    try {
      this._branches = await LocationService.getMyBranches();
    } catch (err) {
      // 401 is handled by fetchClient (redirect to login); for other errors
      // we degrade gracefully — no branches available.
      console.warn('BranchContext: failed to load /me/branches', err);
      this._branches = [];
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    const restored = stored && this._branches.find((b) => b.id === stored);
    if (restored) {
      this._currentId = stored;
    } else {
      const home = this._branches.find((b) => b.is_home);
      const first = this._branches[0];
      const pick = home ?? first ?? null;
      this._currentId = pick ? pick.id : null;
      if (this._currentId) {
        localStorage.setItem(STORAGE_KEY, this._currentId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    this._initialized = true;
  }

  get initialized(): boolean { return this._initialized; }
  get branches(): BranchSummary[] { return this._branches; }
  get currentId(): string | null { return this._currentId; }
  get current(): BranchSummary | null {
    if (!this._currentId) return null;
    return this._branches.find((b) => b.id === this._currentId) ?? null;
  }

  /**
   * Switch the active branch. Pass `null` to clear (admins/owners only —
   * means "all branches" on the server). Dispatches change events even if
   * the id is the same, so listeners can choose how to react.
   */
  setCurrent(id: string | null): void {
    this._currentId = id;
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    const detail: BranchChangedDetail = { branchId: id, branch: this.current };
    this.dispatchEvent(new CustomEvent('branch-changed', { detail }));
    window.dispatchEvent(new CustomEvent('gable:branch-changed', { detail }));
  }

  /**
   * Force a reload of the branches list from the server. Useful after
   * admin-side grant/revoke operations.
   */
  async refresh(): Promise<void> {
    this._initialized = false;
    this._initPromise = null;
    await this.init();
    // If the currently selected branch was revoked, fall back to home/first.
    if (this._currentId && !this._branches.find((b) => b.id === this._currentId)) {
      const home = this._branches.find((b) => b.is_home);
      const first = this._branches[0];
      const next = (home ?? first ?? null)?.id ?? null;
      this.setCurrent(next);
    }
  }
}

export const branchContext = new BranchContextService();
