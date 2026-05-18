/**
 * onBranchChanged — subscribe to the global `gable:branch-changed` event
 * dispatched by `BranchContext.setCurrent()`. Returns an unsubscribe
 * function suitable for storing on a Lit element and calling from
 * `disconnectedCallback()`.
 *
 * Pages use this to re-fetch their data when the user switches branches.
 * The fetchClient automatically stamps `X-Branch-Id` from localStorage,
 * so callers only need to re-issue the request.
 */
export function onBranchChanged(handler: () => void): () => void {
    const fn = () => handler();
    window.addEventListener('gable:branch-changed', fn);
    return () => window.removeEventListener('gable:branch-changed', fn);
}
