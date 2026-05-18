import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { icon } from '../lib/icons.ts';
import {
  LayoutDashboard, Truck, Package, ShoppingCart,
  ShoppingBag, Building2, Sparkles,
} from 'lucide';

/**
 * Local-only landing page that lets a tester pick which UI surface to
 * exercise. Rendered without any layout chrome so it's clear this is a dev
 * launcher rather than an in-product page. The route table only mounts this
 * at `/` when `import.meta.env.DEV` is true.
 */
@customElement('gable-local-test-hub')
export class GableLocalTestHub extends LitElement {
  createRenderRoot() { return this; }

  private _surfaces = [
    {
      title: 'ERP Desktop',
      desc: 'Full back-office: dashboard, orders, inventory, AR, accounting.',
      href: '/dashboard',
      icon: LayoutDashboard,
      accent: 'from-gable-green/30 to-emerald-500/10',
    },
    {
      title: 'B2B Customer Portal',
      desc: 'Dealer self-serve: catalog, cart, invoices, project rooms.',
      href: '/portal',
      icon: ShoppingBag,
      accent: 'from-sky-400/30 to-blue-500/10',
    },
    {
      title: 'Driver Mobile',
      desc: 'Today\u2019s route, stop-by-stop POD capture, signature & photos.',
      href: '/driver',
      icon: Truck,
      accent: 'from-amber-400/30 to-orange-500/10',
    },
    {
      title: 'Yard / Warehouse',
      desc: 'Pick queue, inventory lookup, cycle count, PO receiving.',
      href: '/yard',
      icon: Package,
      accent: 'from-fuchsia-400/30 to-pink-500/10',
    },
    {
      title: 'POS Terminal',
      desc: 'In-store cash/check/account checkout for walk-in counter sales.',
      href: '/pos',
      icon: ShoppingCart,
      accent: 'from-rose-400/30 to-red-500/10',
    },
    {
      title: 'Admin \u00b7 Branches',
      desc: 'Manage Kelowna Main, West Kelowna, Lake Country and user grants.',
      href: '/admin/branches',
      icon: Building2,
      accent: 'from-violet-400/30 to-indigo-500/10',
    },
  ];

  render() {
    const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';
    const eyebrow = isDemo ? 'Public Demo' : 'Local Dev Hub';
    const backendLabel = isDemo ? 'the GableLBM demo backend' : 'the local backend';
    return html`
      <div class="min-h-screen bg-deep-space text-white font-sans">
        <div class="max-w-6xl mx-auto px-6 py-12">
          <header class="flex items-center gap-3 mb-2">
            ${icon(Sparkles, 22, 'text-gable-green')}
            <span class="text-xs uppercase tracking-[0.2em] text-zinc-500">${eyebrow}</span>
          </header>
          <h1 class="text-4xl font-semibold mb-3">
            Gable<span class="text-gable-green">LBM</span>
            <span class="text-zinc-400 font-light"> \u00b7 Surface Picker</span>
          </h1>
          <p class="text-zinc-400 max-w-2xl mb-2">
            Choose a UI surface to exercise against ${backendLabel}. Demo tenant:
            <span class="text-white font-medium">Gable Lumber &amp; Supply, Kelowna BC</span>
            (Kelowna Main, West Kelowna, Lake Country).
          </p>
          <p class="text-xs text-zinc-500 mb-10 font-mono">
            Auth: <span class="text-amber-400">dev (bypassed)</span> \u00b7
            Data resets on each redeploy.
          </p>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            ${this._surfaces.map(s => html`
              <a
                href="${s.href}"
                class="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-steel/80 backdrop-blur-sm p-6 hover:border-white/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevation-2"
              >
                <div class="absolute inset-0 bg-gradient-to-br ${s.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
                <div class="relative z-10">
                  <div class="h-11 w-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-gable-green">
                    ${icon(s.icon, 22)}
                  </div>
                  <h2 class="text-lg font-semibold mb-1">${s.title}</h2>
                  <p class="text-sm text-zinc-400 leading-relaxed">${s.desc}</p>
                  <div class="mt-4 text-xs font-mono text-zinc-500 group-hover:text-gable-green transition-colors">
                    ${s.href} \u2192
                  </div>
                </div>
              </a>
            `)}
          </div>

          <footer class="mt-12 pt-6 border-t border-white/5 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
            <span class="font-mono">Portal logins:</span>
            <code class="text-zinc-300">demo@gable.com</code>
            <code class="text-zinc-300">summit@gable.com</code>
            <code class="text-zinc-300">elite@gable.com</code>
            <span class="text-zinc-500">/ password <code class="text-zinc-300">password</code></span>
          </footer>
        </div>
      </div>
    `;
  }
}
