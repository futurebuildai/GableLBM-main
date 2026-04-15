import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/Card';
import { ArrowLeft, AlertTriangle, ShoppingCart, Truck, FileText, Calendar } from 'lucide-react';
import { ProjectService } from '../../services/ProjectService';
import type { ProjectDashboardDTO, ProjectItem } from '../../types/project';
import { useToast } from '../../components/ui/ToastContext';

export const ProjectDashboard = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [data, setData] = useState<ProjectDashboardDTO | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchDashboard = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError('');
        try {
            const result = await ProjectService.getProjectDashboard(id);
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load project dashboard');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    const handleStatusToggle = async () => {
        if (!data) return;
        const newStatus = data.project.status === 'Active' ? 'Completed' : 'Active';
        try {
            await ProjectService.updateProject(data.project.id, { status: newStatus });
            setData({
                ...data,
                project: { ...data.project, status: newStatus }
            });
            showToast(`Project marked as ${newStatus}`, 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to update status', 'error');
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-32 bg-white/5 rounded-lg animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-32 bg-white/5 rounded-2xl animate-pulse" />
                    ))}
                </div>
                <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center">
                <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
                <p className="text-zinc-400 mb-4">{error || 'Project not found'}</p>
                <button
                    onClick={() => navigate('/portal/projects')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                >
                    <ArrowLeft size={16} /> Back to Projects
                </button>
            </div>
        );
    }

    const { project, orders, deliveries, invoices } = data;

    const totalOrdersAmount = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalInvoicesAmount = invoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);

    const ItemRow = ({ item, icon: Icon, colorClass, linkPrefix }: { item: ProjectItem, icon: React.ComponentType<{ size?: number; className?: string }>, colorClass: string, linkPrefix: string }) => (
        <div
            onClick={() => navigate(`/portal/${linkPrefix}/${item.id}`)}
            className="p-4 flex items-center justify-between hover:bg-white/5 border-b border-white/5 last:border-0 cursor-pointer transition-colors"
        >
            <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${colorClass}-500/10 text-${colorClass}-400`}>
                    <Icon size={16} />
                </div>
                <div>
                    <div className="font-medium text-white flex items-center gap-2">
                        {item.reference || item.id.substring(0, 8).toUpperCase()}
                        <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {item.status.replace('_', ' ')}
                        </span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                        <Calendar size={12} /> {new Date(item.created_at).toLocaleDateString()}
                    </div>
                </div>
            </div>
            {item.total_amount !== undefined && item.total_amount > 0 && (
                <div className="font-mono text-sm text-white">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.total_amount)}
                </div>
            )}
        </div>
    );

    return (
        <div>
            {/* Header */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/portal/projects')}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                            {project.name}
                        </h1>
                        <p className="text-zinc-400 text-sm mt-1">Project Dashboard</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`text-[10px] uppercase font-semibold tracking-wider px-2 py-1 rounded border ${project.status === 'Active'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }`}>
                        {project.status}
                    </span>
                    <button
                        onClick={handleStatusToggle}
                        className="px-4 py-2 border border-white/10 text-white text-sm font-medium rounded-lg hover:bg-white/5 transition-colors"
                    >
                        Mark {project.status === 'Active' ? 'Completed' : 'Active'}
                    </button>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card variant="glass">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                <ShoppingCart size={20} />
                            </div>
                            <div>
                                <h3 className="text-zinc-400 text-sm font-medium">Total Orders</h3>
                                <div className="text-2xl font-bold text-white">{orders.length}</div>
                            </div>
                        </div>
                        <div className="text-sm text-zinc-500 border-t border-white/5 pt-3">
                            Est. Value: <span className="font-mono text-white ml-1">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalOrdersAmount)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card variant="glass">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                                <Truck size={20} />
                            </div>
                            <div>
                                <h3 className="text-zinc-400 text-sm font-medium">Deliveries</h3>
                                <div className="text-2xl font-bold text-white">{deliveries.length}</div>
                            </div>
                        </div>
                        <div className="text-sm text-zinc-500 border-t border-white/5 pt-3">
                            {deliveries.filter(d => d.status === 'DELIVERED').length} completed deliveries
                        </div>
                    </CardContent>
                </Card>

                <Card variant="glass">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                <FileText size={20} />
                            </div>
                            <div>
                                <h3 className="text-zinc-400 text-sm font-medium">Invoices</h3>
                                <div className="text-2xl font-bold text-white">{invoices.length}</div>
                            </div>
                        </div>
                        <div className="text-sm text-zinc-500 border-t border-white/5 pt-3">
                            Invoiced: <span className="font-mono text-white ml-1">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalInvoicesAmount)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Timelines / Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card variant="glass" className="flex flex-col">
                    <div className="p-4 border-b border-white/5 border-[1px] border-b-white/10 flex items-center justify-between">
                        <h3 className="font-medium text-white flex items-center gap-2">
                            <ShoppingCart size={16} className="text-blue-400" /> Recent Orders
                        </h3>
                    </div>
                    {orders.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500 h-full flex items-center justify-center">
                            No orders associated with this project.
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto max-h-96">
                            {orders.map(o => <ItemRow key={o.id} item={o} icon={ShoppingCart} colorClass="blue" linkPrefix="orders" />)}
                        </div>
                    )}
                </Card>

                <Card variant="glass" className="flex flex-col">
                    <div className="p-4 border-b border-white/5 border-[1px] border-b-white/10 flex items-center justify-between">
                        <h3 className="font-medium text-white flex items-center gap-2">
                            <FileText size={16} className="text-emerald-400" /> Recent Invoices
                        </h3>
                    </div>
                    {invoices.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500 h-full flex items-center justify-center">
                            No invoices associated with this project.
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto max-h-96">
                            {invoices.map(i => <ItemRow key={i.id} item={i} icon={FileText} colorClass="emerald" linkPrefix="invoices" />)}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};
