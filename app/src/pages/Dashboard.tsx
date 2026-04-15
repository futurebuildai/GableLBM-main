import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, DollarSign, ShoppingCart, Truck, CreditCard, Calendar, AlertCircle } from 'lucide-react';
import { DashboardService } from '../services/DashboardService';
import { KPICard } from '../components/dashboard/KPICard';
import { RevenueTrendChart } from '../components/dashboard/RevenueTrendChart';
import { OrderStatusChart } from '../components/dashboard/OrderStatusChart';
import { TopCustomersTable } from '../components/dashboard/TopCustomersTable';
import { InventoryAlertsWidget } from '../components/dashboard/InventoryAlertsWidget';
import { RecentOrdersFeed } from '../components/dashboard/RecentOrdersFeed';
import { useToast } from '../components/ui/ToastContext';
import { Button } from '../components/ui/Button';
import { motion } from 'framer-motion';
import type {
    DashboardSummary,
    InventoryAlert,
    TopCustomer,
    OrderActivity,
    RevenueTrendPoint,
} from '../types/dashboard';

const REFRESH_INTERVAL = 60000; // 60 seconds


const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

export const Dashboard = () => {
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([]);
    const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
    const [orderActivity, setOrderActivity] = useState<OrderActivity | null>(null);
    const [revenueTrend, setRevenueTrend] = useState<RevenueTrendPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [refreshing, setRefreshing] = useState(false);
    const { showToast } = useToast();

const fetchDashboardData = useCallback(async (showSpinner = false) => {
        if (showSpinner) setRefreshing(true);
        try {
            const [summaryData, alertsData, customersData, activityData, trendData] = await Promise.all([
                DashboardService.getSummary(),
                DashboardService.getInventoryAlerts(),
                DashboardService.getTopCustomers(),
                DashboardService.getOrderActivity(),
                DashboardService.getRevenueTrend(),
            ]);
            setSummary(summaryData);
            setInventoryAlerts(alertsData);
            setTopCustomers(customersData);
            setOrderActivity(activityData);
            setRevenueTrend(trendData);
            setLastRefresh(new Date());
            setError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An unexpected error occurred';
            console.error('Failed to fetch dashboard data:', err);
            setError(message);
            if (showSpinner) {
                showToast('Failed to refresh dashboard data', 'error');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchDashboardData();
        const interval = setInterval(() => fetchDashboardData(), REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchDashboardData]);

    const formatCurrency = (cents: number) => {
        return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    };

    const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    const userRaw = localStorage.getItem('user');
    const userName = userRaw ? (() => { try { const u = JSON.parse(userRaw); return u.name || u.firstName || ''; } catch { return ''; } })() : '';
    const greeting = userName ? `${timeGreeting}, ${userName}` : timeGreeting;

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-8"
        >
            {/* Header & Hero */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 text-zinc-400 text-sm font-medium mb-1"
                    >
                        <Calendar className="w-4 h-4" />
                        {currentDate}
                    </motion.div>
                    <h1 className="text-display-large text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
                        {greeting}
                    </h1>
                    <p className="text-zinc-500 mt-1">
                        Here's what's happening at the yard today.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right text-xs text-zinc-500 hidden md:block">
                        <div className="font-mono">Last updated: {lastRefresh.toLocaleTimeString()}</div>
                        <div className="flex items-center gap-1 justify-end mt-1">
                            <span className={`w-2 h-2 rounded-full ${error ? 'bg-rose-500' : 'bg-gable-green'} animate-pulse`}></span>
                            {error ? 'Error' : 'Live'}
                        </div>
                    </div>
                    <Button
                        onClick={() => fetchDashboardData(true)}
                        disabled={refreshing}
                        variant="secondary"
                        size="sm"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Error Banner */}
            {error && !loading && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400"
                >
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-medium">Unable to load dashboard data</p>
                        <p className="text-xs text-rose-400/70 mt-0.5">
                            {error}. Data shown may be stale.
                        </p>
                    </div>
                    <Button
                        onClick={() => fetchDashboardData(true)}
                        disabled={refreshing}
                        variant="secondary"
                        size="sm"
                    >
                        Retry
                    </Button>
                </motion.div>
            )}

            {/* KPI Cards */}
            <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Today's Revenue"
                    value={summary ? formatCurrency(summary.today_revenue) : '$0.00'}
                    trend={summary?.today_revenue_change}
                    icon={<DollarSign className="w-5 h-5" />}
                    loading={loading}
                    valueColor="text-gable-green"
                />
                <KPICard
                    title="Active Orders"
                    value={summary?.active_orders ?? 0}
                    icon={<ShoppingCart className="w-5 h-5" />}
                    loading={loading}
                />
                <KPICard
                    title="Pending Dispatch"
                    value={summary?.pending_dispatch ?? 0}
                    icon={<Truck className="w-5 h-5" />}
                    loading={loading}
                    valueColor="text-blueprint-blue"
                />
                <KPICard
                    title="Outstanding AR"
                    value={summary ? formatCurrency(summary.outstanding_ar) : '$0.00'}
                    subValue={summary ? `${summary.outstanding_ar_count} invoices` : undefined}
                    icon={<CreditCard className="w-5 h-5" />}
                    loading={loading}
                    valueColor="text-amber-400"
                />
            </motion.div>

            {/* Charts Row */}
            <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <RevenueTrendChart data={revenueTrend} loading={loading} />
                </div>
                <div>
                    <OrderStatusChart
                        statusBreakdown={orderActivity?.status_breakdown ?? {}}
                        loading={loading}
                    />
                </div>
            </motion.div>

            {/* Widgets Row */}
            <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <TopCustomersTable customers={topCustomers} loading={loading} />
                <InventoryAlertsWidget alerts={inventoryAlerts} loading={loading} />
                <RecentOrdersFeed orders={orderActivity?.recent_orders ?? []} loading={loading} />
            </motion.div>
        </motion.div>
    );
};
