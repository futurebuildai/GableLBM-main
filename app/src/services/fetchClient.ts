/**
 * Shared fetch wrapper with auth headers, timeout, and retry logic.
 * Drop-in replacement for fetch() — all frontend services should use this.
 */

const DEFAULT_TIMEOUT = 10_000; // 10 seconds
const DEFAULT_RETRIES = 1;
const RETRY_DELAY = 2_000; // 2 seconds

export interface FetchWithAuthOptions extends Omit<RequestInit, 'signal'> {
  timeout?: number;
  retries?: number;
  signal?: AbortSignal | null;
}

/**
 * Fetch wrapper that automatically:
 * - Injects Bearer auth token from localStorage
 * - Applies request timeout via AbortController
 * - Retries on network errors (not on HTTP error status codes)
 */
export async function fetchWithAuth(
  url: string,
  options: FetchWithAuthOptions = {}
): Promise<Response> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    headers: customHeaders,
    signal: externalSignal,
    ...fetchOpts
  } = options;

  const headers = new Headers(customHeaders);

  // Inject auth token if not already present (ERP/OIDC flows using localStorage)
  if (!headers.has('Authorization')) {
    const token = localStorage.getItem('token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  // Inject the currently selected branch for multi-branch installs.
  // We read straight from localStorage to avoid a circular import with the
  // BranchContext singleton, which itself uses fetchWithAuth at init time.
  if (!headers.has('X-Branch-Id')) {
    const branchId = localStorage.getItem('gable_current_branch_id');
    if (branchId) {
      headers.set('X-Branch-Id', branchId);
    }
  }

  // Ensure Content-Type is set for JSON requests
  if (!headers.has('Content-Type') && fetchOpts.body && typeof fetchOpts.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // If an external signal is provided, abort when it fires
    if (externalSignal != null) {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(url, {
        ...fetchOpts,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // 401 Interceptor: clear auth state, redirect to login, and throw
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('portal_token');
        localStorage.removeItem('portal_user');
        localStorage.removeItem('portal_config');

        const path = window.location.pathname;
        // Redirect to the appropriate login page based on the current surface
        if (path.startsWith('/portal') && !path.endsWith('/login')) {
          window.location.href = '/portal/login';
        } else if (!path.startsWith('/portal') && !path.endsWith('/login')) {
          window.location.href = '/login';
        }

        throw new Error('Session expired');
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry if the caller explicitly aborted
      if (externalSignal?.aborted) {
        throw lastError;
      }

      // Retry on network errors, not on intentional aborts from timeout
      if (attempt < retries && lastError.name !== 'AbortError') {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  throw lastError!;
}
