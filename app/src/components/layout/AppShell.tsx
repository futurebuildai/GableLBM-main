import { LayoutDashboard, LayoutGrid, Package, Truck, FileText, Settings, Menu, Hammer, ChevronLeft, ChevronRight, Search, ShoppingBag, Store, BookOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Omnibar } from '../ui/Omnibar';
import { ShortcutsModal } from '../ui/ShortcutsModal';
import { PageTransition } from '../ui/PageTransition';
import { motion, AnimatePresence } from 'framer-motion';


import { BrandLogo } from '../ui/BrandLogo';

export function AppShell({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const location = useLocation();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '?' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
                e.preventDefault();
                setShortcutsOpen(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="min-h-screen bg-deep-space text-foreground flex overflow-hidden font-sans selection:bg-gable-green/30">
            {/* Sidebar */}
            <motion.aside
                initial={false}
                animate={{ width: sidebarOpen ? 280 : 80 }}
                transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }} // MD3 Emphasized easing
                className="bg-slate-steel border-r border-white/5 flex flex-col fixed inset-y-0 left-0 z-50 shadow-elevation-2"
            >
                {/* Logo Section */}
                <div className="h-16 flex items-center px-4 border-b border-white/5 relative bg-deep-space/20">
                    <div className="flex-1 flex items-center gap-3 overflow-hidden">
                        <div className="h-10 w-10 flex items-center justify-center shrink-0">
                            <BrandLogo variant="mark" size="md" className="text-white drop-shadow-glow" />
                        </div>
                        <motion.div
                            animate={{ opacity: sidebarOpen ? 1 : 0 }}
                            className="whitespace-nowrap"
                        >
                            <BrandLogo variant="text" size="md" />
                        </motion.div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto no-scrollbar">
                    <div className="mb-6">
                        <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" isOpen={sidebarOpen} active={location.pathname === '/'} />
                        <NavItem to="/inventory" icon={<Package size={20} />} label="Inventory" isOpen={sidebarOpen} active={location.pathname.startsWith('/inventory')} />
                        <NavItem to="/accounts" icon={<LayoutDashboard size={20} />} label="Accounts" isOpen={sidebarOpen} active={location.pathname.startsWith('/accounts')} />
                    </div>

                    <div className="mb-2 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        {sidebarOpen && "Operations"}
                    </div>

                    <NavItem to="/quotes" icon={<FileText size={20} />} label="Quotes" isOpen={sidebarOpen} active={location.pathname.startsWith('/quotes')} />
                    <NavItem to="/orders" icon={<FileText size={20} />} label="Orders" isOpen={sidebarOpen} active={location.pathname.startsWith('/orders')} />
                    <NavItem to="/purchasing" icon={<ShoppingBag size={20} />} label="Purchasing" isOpen={sidebarOpen} active={location.pathname === '/purchasing' || (location.pathname.startsWith('/purchasing') && !location.pathname.includes('/vendors'))} />
                    <NavItem to="/purchasing/vendors" icon={<Store size={20} />} label="Vendors" isOpen={sidebarOpen} active={location.pathname.startsWith('/purchasing/vendors')} />
                    <NavItem to="/invoices" icon={<FileText size={20} />} label="Invoices" isOpen={sidebarOpen} active={location.pathname.startsWith('/invoices')} />
                    <NavItem to="/millwork/configurator" icon={<Hammer size={20} />} label="Millwork" isOpen={sidebarOpen} active={location.pathname.startsWith('/millwork')} />
                    <NavItem to="/dispatch" icon={<Truck size={20} />} label="Logistics" isOpen={sidebarOpen} active={location.pathname.startsWith('/dispatch')} />
                    <NavItem to="/fleet" icon={<Settings size={20} />} label="Fleet" isOpen={sidebarOpen} active={location.pathname.startsWith('/fleet')} />
                    <NavItem to="/reports/daily-till" icon={<LayoutDashboard size={20} />} label="Daily Till" isOpen={sidebarOpen} active={location.pathname.startsWith('/reports')} />

                    <div className="mb-2 mt-4 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        {sidebarOpen && "Accounting"}
                    </div>

                    <NavItem to="/accounting/chart-of-accounts" icon={<BookOpen size={20} />} label="Chart of Accounts" isOpen={sidebarOpen} active={location.pathname === '/accounting/chart-of-accounts'} />
                    <NavItem to="/accounting/journal-entries" icon={<FileText size={20} />} label="Journal Entries" isOpen={sidebarOpen} active={location.pathname === '/accounting/journal-entries'} />
                    <NavItem to="/accounting/trial-balance" icon={<LayoutDashboard size={20} />} label="Trial Balance" isOpen={sidebarOpen} active={location.pathname === '/accounting/trial-balance'} />
                </nav>

                {/* Footer / Admin */}
                <div className="p-3 border-t border-white/5 bg-slate-steel/50 space-y-1">
                    <NavItem to="/pricing" icon={<LayoutGrid size={20} />} label="Pricing" isOpen={sidebarOpen} active={location.pathname.startsWith('/pricing')} />
                    <NavItem to="/admin" icon={<Settings size={20} />} label="Admin" isOpen={sidebarOpen} active={location.pathname.startsWith('/admin')} />
                </div>

                {/* Collapse Toggle */}
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="absolute -right-3 top-20 bg-slate-steel border border-white/10 rounded-full p-1 text-zinc-400 hover:text-white shadow-elevation-1 hover:shadow-glow transition-all duration-200 z-50 text-xs flex items-center justify-center w-6 h-6"
                >
                    {sidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
                </button>
            </motion.aside>

            {/* Main Content */}
            <motion.main
                animate={{ marginLeft: sidebarOpen ? 280 : 80 }}
                transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
                className="flex-1 flex flex-col min-h-screen relative w-full"
            >
                {/* Header */}
                <header className="h-16 border-b border-white/5 bg-deep-space/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-40 shadow-sm">
                    {/* Search Trigger */}
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)} // Mobile toggle only? 
                        className="lg:hidden p-2 mr-4 hover:bg-white/5 rounded-md text-muted-foreground"
                    >
                        <Menu size={20} />
                    </button>

                    <div className="flex-1 max-w-xl">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-gable-green transition-colors" />
                            <input
                                type="text"
                                placeholder="Search everything... (Cmd+K)"
                                className="w-full bg-slate-steel/50 border border-white/5 rounded-full py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50 focus:bg-slate-steel transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-xs text-zinc-500 font-medium hidden lg:block bg-white/5 px-2 py-1 rounded border border-white/5">
                            ⌘K
                        </div>
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-gable-green/20 to-emerald-500/20 border border-gable-green/30 flex items-center justify-center text-xs font-mono font-bold text-gable-green shadow-glow cursor-pointer hover:scale-105 transition-transform">
                            AD
                        </div>
                    </div>
                </header>

                {/* Page Content with Transition */}
                <div className="p-6 md:p-8 max-w-[1600px] w-full">
                    <PageTransition key={location.pathname}>
                        {children}
                    </PageTransition>
                </div>
            </motion.main>
            <Omnibar />
            <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

        </div>
    );
}

function NavItem({ icon, label, isOpen, active = false, to }: { icon: React.ReactNode, label: string, isOpen: boolean, active?: boolean, to: string }) {
    return (
        <Link to={to} className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium group relative overflow-hidden",
            active
                ? "text-gable-green bg-gable-green/10 shadow-[inset_0_0_0_1px_rgba(0,255,163,0.2)]"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
        )}>
            {/* Active Indicator Bar */}
            {active && (
                <motion.div
                    layoutId="active-nav"
                    className="absolute left-0 top-2 bottom-2 w-1 bg-gable-green rounded-r-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                />
            )}

            <span className={cn("transition-colors relative z-10", active ? "text-gable-green" : "group-hover:text-white")}>
                {icon}
            </span>

            <AnimatePresence>
                {isOpen && (
                    <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="whitespace-nowrap relative z-10"
                    >
                        {label}
                    </motion.span>
                )}
            </AnimatePresence>

            {/* Hover Glow */}
            {!active && (
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            )}
        </Link>
    )
}
