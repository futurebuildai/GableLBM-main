/**
 * Millwork app manifest (reference conversion #1).
 * Backend counterpart: internal/millwork/manifest.go — the app owns the
 * millwork + configurator backend modules.
 */
import { Hammer } from 'lucide';
import type { FrontendAppManifest } from './types.ts';

export const millworkApp: FrontendAppManifest = {
  key: 'millwork',
  name: 'Millwork',
  routes: [
    { path: '/millwork/configure', tag: 'gable-door-configurator', load: () => import('../pages/millwork/DoorConfigurator.ts'), layout: 'erp' },
    { path: '/millwork/configurator', tag: 'gable-product-configurator', load: () => import('../pages/millwork/ProductConfigurator.ts'), layout: 'erp' },
    { path: '/millwork/blueprint', tag: 'gable-blueprint-verifier', load: () => import('../pages/millwork/BlueprintVerifier.ts'), layout: 'erp' },
  ],
  nav: [
    { label: 'Product Configurator', path: '/millwork/configurator', icon: Hammer, order: 10 },
    { label: 'Door Configurator', path: '/millwork/configure', icon: Hammer, order: 20 },
    { label: 'Blueprint Verifier', path: '/millwork/blueprint', icon: Hammer, order: 30 },
  ],
};
