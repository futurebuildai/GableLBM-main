import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  ShoppingCart,
  Globe,
  Truck,
  Warehouse,
} from 'lucide-react';

const surfaces = [
  {
    name: 'ERP Desktop',
    description: 'Full back-office: sales, inventory, purchasing, accounting, dispatch, and reporting.',
    icon: LayoutDashboard,
    path: '/erp',
    color: '#00FFA3',
    badge: 'Desktop',
  },
  {
    name: 'Point of Sale',
    description: 'Counter-speed retail terminal with barcode scanning, split payments, and account charge.',
    icon: ShoppingCart,
    path: '/pos',
    color: '#38BDF8',
    badge: 'Terminal',
  },
  {
    name: 'Dealer Portal',
    description: 'B2B self-service for contractors — catalog, cart, order tracking, and project management.',
    icon: Globe,
    path: '/portal',
    color: '#A78BFA',
    badge: 'B2B',
  },
  {
    name: 'Driver App',
    description: 'Mobile delivery management with route optimization, stop tracking, and proof-of-delivery.',
    icon: Truck,
    path: '/driver',
    color: '#FB923C',
    badge: 'Mobile',
  },
  {
    name: 'Yard Operations',
    description: 'Warehouse picking, receiving, cycle counts, and inventory lookup — all from a handheld.',
    icon: Warehouse,
    path: '/yard',
    color: '#FBBF24',
    badge: 'Mobile',
  },
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

export const DemoLanding = () => (
  <div className="min-h-screen bg-[#0A0B10] flex flex-col">
    {/* Header */}
    <header className="border-b border-white/5 px-8 py-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-[#00FFA3] flex items-center justify-center">
          <span className="text-[#0A0B10] font-bold text-sm">G</span>
        </div>
        <span className="text-white font-semibold text-lg tracking-tight">GableLBM</span>
        <span className="text-xs font-mono text-slate-500 ml-2 hidden sm:inline">Community Demo</span>
      </div>
      <a
        href="https://github.com/futurebuildai/GableLBM-main"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-slate-500 hover:text-white transition-colors font-mono"
      >
        github.com/futurebuildai/GableLBM-main
      </a>
    </header>

    {/* Hero */}
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12 max-w-2xl"
      >
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
          Open-Source ERP for{' '}
          <span className="text-[#00FFA3]">Lumber &amp; Building Materials</span>
        </h1>
        <p className="text-slate-400 mt-4 text-lg leading-relaxed">
          Five integrated surfaces — one platform. Explore the live demo below.
        </p>
      </motion.div>

      {/* Surface Grid */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl"
      >
        {surfaces.map((s) => (
          <motion.div key={s.path} variants={fadeUp}>
            <Link
              to={s.path}
              className="group block bg-[#161821] border border-white/5 rounded-xl p-6 hover:border-white/10 transition-all hover:shadow-lg hover:shadow-black/20"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${s.color}15` }}
                >
                  <s.icon size={20} style={{ color: s.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-white font-semibold group-hover:text-[#00FFA3] transition-colors">
                    {s.name}
                  </h2>
                </div>
                <span
                  className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${s.color}15`, color: s.color }}
                >
                  {s.badge}
                </span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                {s.description}
              </p>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      {/* Seed Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-10 text-center text-xs text-slate-600 max-w-lg space-y-1"
      >
        <p>
          Demo is pre-seeded with 66 products, 13 customers, 71 orders, 8 locations, and full pricing tiers.
        </p>
        <p>
          Portal logins: <span className="font-mono text-slate-500">demo@gable.com</span> / <span className="font-mono text-slate-500">password</span>
        </p>
      </motion.div>
    </div>

    {/* Footer */}
    <footer className="border-t border-white/5 px-8 py-4 text-center">
      <p className="text-xs text-slate-600">
        Built by <span className="text-slate-500">FutureBuild AI</span> &mdash; Apache 2.0 License
      </p>
    </footer>
  </div>
);

export default DemoLanding;
