import './index.css';
import { router } from './lib/router.ts';
import { routes } from './routes.ts';
import './app.ts';

// Initialize the router with the route table
router.init(routes);

// Mount the app into #root (replacing the loading spinner from index.html)
const root = document.getElementById('root');
if (root) {
  root.innerHTML = '<gable-app></gable-app>';
}
