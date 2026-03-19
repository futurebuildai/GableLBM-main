import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, ShoppingCart, Truck, LogOut, ChevronLeft, ChevronRight, Bell, Users, FolderGit2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { clearToken } from '../../services/PortalService';
import type { PortalConfig, PortalUser } from '../../types/portal';
import { BrandLogo } from '../ui/BrandLogo';

export const PortalLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
    const location = useLocation();


    // Lazy-init from localStorage (avoids setState-in-effect lint rule)
    const [config] = useState<PortalConfig | null>(() => {
        try {
            const stored = localStorage.getItem('portal_config');
            return stored ? (JSON.parse(stored) as PortalConfig) : null;
        } catch { return null; }
    });
    const [user] = useState<PortalUser | null>(() => {
        try {
            const stored = localStorage.getItem('portal_user');
            return stored ? (JSON.parse(stored) as PortalUser) : null;
        } catch { return null; }
    });

    useEffect(() => {
        // TODO: Replace with real auth — redirect to login if no portal_user
    }, []);

    const handleLogout = () => {
        clearToken();
        localStorage.removeItem('portal_config');
        localStorage.removeItem('portal_user');
        window.location.href = '/';
    };

    const primaryColor = config?.primary_color || '#00FFA3';

    const navItems = [
        { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/portal' },
        { icon: <FolderGit2 size={20} />, label: 'Projects', path: '/portal/projects' },
        { icon: <ShoppingCart size={20} />, label: 'Orders', path: '/portal/orders' },
        { icon: <FileText size={20} />, label: 'Invoices', path: '/portal/invoices' },
        { icon: <Truck size={20} />, label: 'Deliveries', path: '/portal/deliveries' },
        { icon: <Users size={20} />, label: 'Team', path: '/portal/team' },
    ];

    return (
        <div
            className="min-h-screen text-foreground flex font-sans selection:bg-gable-green/30"
            style={{
                '--portal-primary': primaryColor,
                backgroundColor: '#0C0E14',
            } as React.CSSProperties}
        >
            {/* Mobile overlay backdrop */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    'border-r border-white/10 transition-all duration-300 flex flex-col fixed inset-y-0 left-0 z-50 shadow-2xl',
                    sidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-20',
                )}
                style={{ backgroundColor: '#111320' }}
            >
                {/* Brand Header */}
                <div className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-white/5 backdrop-blur-sm">
                    <div className={cn('flex items-center gap-3 transition-opacity duration-200', !sidebarOpen && 'opacity-0 hidden')}>
                        {config?.logo_url ? (
                            <img src={config.logo_url} alt={config?.dealer_name} className="h-8 w-auto object-contain" />
                        ) : (
                            <BrandLogo variant="text" size="md" />
                        )}
                    </div>
                    {!sidebarOpen && (
                        <div className="mx-auto flex items-center justify-center w-8 h-8">
                            <BrandLogo variant="mark" size="sm" className="text-white" />
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-6 px-3 space-y-1">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={cn(
                                    'flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative overflow-hidden',
                                    isActive
                                        ? 'text-white shadow-lg'
                                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5',
                                )}
                                style={isActive ? {
                                    backgroundColor: `${primaryColor}15`,
                                    color: primaryColor,
                                    boxShadow: `0 0 20px ${primaryColor}15`,
                                } : undefined}
                            >
                                {isActive && (
                                    <div
                                        className="absolute inset-y-0 left-0 w-1 rounded-r-full"
                                        style={{ backgroundColor: primaryColor }}
                                    />
                                )}
                                <span className={cn('transition-transform duration-200 group-hover:scale-110', isActive && 'scale-110')}>
                                    {item.icon}
                                </span>
                                <span className={cn(
                                    'font-medium transition-all duration-300 origin-left',
                                    sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 absolute',
                                )}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-white/5 bg-white/5">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-colors"
                    >
                        {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                    </button>

                    <div className={cn('mt-4 flex items-center gap-3 transition-all duration-300', !sidebarOpen && 'justify-center')}>
                        <div
                            className="h-8 w-8 rounded-full p-[1px] shrink-0"
                            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}80)` }}
                        >
                            <div className="h-full w-full rounded-full flex items-center justify-center" style={{ backgroundColor: '#111320' }}>
                                <span className="font-bold text-xs text-white">
                                    {user?.name?.split(' ').map(n => n[0]).join('') || '??'}
                                </span>
                            </div>
                        </div>
                        {sidebarOpen && (
                            <div className="overflow-hidden flex-1">
                                <div className="text-sm font-medium text-white truncate">{user?.name || 'Contractor'}</div>
                                <div className="text-xs text-zinc-500 truncate">{user?.email || ''}</div>
                            </div>
                        )}
                        {sidebarOpen && (
                            <button
                                onClick={handleLogout}
                                className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-red-400 transition-colors"
                                title="Sign Out"
                            >
                                <LogOut size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className={cn(
                'flex-1 flex flex-col min-h-screen transition-all duration-300',
                sidebarOpen ? 'md:ml-64' : 'md:ml-20',
            )}>
                {/* Header */}
                <header
                    className="h-16 border-b border-white/10 backdrop-blur-md sticky top-0 z-40 px-8 flex items-center justify-between shadow-sm"
                    style={{ backgroundColor: '#111320cc' }}
                >
                    <div className="flex items-center gap-4">
                        {/* Mobile hamburger */}
                        <button
                            className="md:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                        </button>
                        <h2 className="text-xl font-semibold text-white tracking-tight">
                            {navItems.find(i => i.path === location.pathname)?.label || 'Portal'}
                        </h2>
                    </div>
                    <div className="flex items-center gap-4">
                        {config?.support_email && (
                            <span className="text-xs text-zinc-500">
                                Support: {config.support_email}
                            </span>
                        )}
                        <button className="relative p-2 text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-white/5">
                            <Bell size={20} />
                        </button>
                    </div>
                </header>

                <div className="flex-1 p-4 md:p-8 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};
