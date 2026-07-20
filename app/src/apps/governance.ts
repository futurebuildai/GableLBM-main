/**
 * Governance app manifest (reference conversion #2).
 * Backend counterpart: internal/governance/manifest.go.
 *
 * Note: governance pages were previously routed but had NO sidebar entry
 * (reachable by URL only). The manifest gives the app a nav item — enabling
 * the app is what lights it up.
 */
import { ScrollText } from 'lucide';
import type { FrontendAppManifest } from './types.ts';

export const governanceApp: FrontendAppManifest = {
  key: 'governance',
  name: 'Governance (RFCs)',
  routes: [
    // Order matters: '/governance/new' must precede '/governance/:id'.
    { path: '/governance/new', tag: 'gable-new-rfc', load: () => import('../pages/governance/NewRFC.ts'), layout: 'erp' },
    { path: '/governance/:id', tag: 'gable-rfc-detail', load: () => import('../pages/governance/RFCDetail.ts'), layout: 'erp' },
    { path: '/governance', tag: 'gable-rfc-dashboard', load: () => import('../pages/governance/RFCDashboard.ts'), layout: 'erp' },
  ],
  nav: [
    { label: 'Governance', path: '/governance', icon: ScrollText, section: 'footer', order: 10 },
  ],
};
