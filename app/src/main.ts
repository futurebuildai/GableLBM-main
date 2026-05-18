import './index.css';
import { router } from './lib/router.ts';
import { routes } from './routes.ts';
import { branchContext } from './services/BranchContext.ts';
import './app.ts';

// Mount the app into #root (replacing the loading spinner from index.html)
const root = document.getElementById('root');
if (root) {
  root.innerHTML = '<gable-app></gable-app>';
}

// Load the user's branch grants and pick a default BEFORE the router
// dispatches its first route. This guarantees X-Branch-Id is set on the
// page's initial data fetches. We swallow errors here so the app still
// boots when the user is unauthenticated (login screen) or the API is
// unreachable — pages will surface their own errors.
branchContext.init().finally(() => {
  router.init(routes);
});
