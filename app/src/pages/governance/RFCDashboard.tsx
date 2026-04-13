import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GovernanceService } from '../../services/governance.service';
import type { RFC } from '../../types/governance';
import { PageTransition } from '../../components/ui/PageTransition';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Plus, GitPullRequest, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export function RFCDashboard() {
    const [rfcs, setRfcs] = useState<RFC[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        let cancelled = false;
        // loading is initially true
        GovernanceService.listRFCs()
            .then((data) => {
                if (!cancelled) setRfcs(data);
            })
            .catch(console.error)
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    const statusConfig = (status: string) => {
        switch (status.toLowerCase()) {
            case 'approved': return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle };
            case 'rejected': return { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', icon: AlertCircle };
            case 'review': return { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Clock };
            default: return { color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', icon: FileText };
        }
    };

    return (
        <PageTransition>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-display-large text-white flex items-center gap-3">
                        <GitPullRequest className="w-10 h-10 text-gable-green" />
                        Governance
                    </h1>
                    <p className="text-zinc-500 mt-1 max-w-2xl text-lg">
                        Manage architectural decisions, RFCs, and change requests.
                    </p>
                </div>
                <Button
                    onClick={() => navigate('/governance/new')}
                    className="shadow-glow"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Draft New RFC
                </Button>
            </div>

            <Card variant="glass" className="h-full">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-white/5 text-zinc-400 text-xs uppercase tracking-wider font-medium bg-white/5">
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Title / ID</th>
                                    <th className="px-6 py-4">Problem Statement</th>
                                    <th className="px-6 py-4 text-right">Created</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 animate-pulse">
                                            Loading RFCs...
                                        </td>
                                    </tr>
                                ) : rfcs.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="h-12 w-12 rounded-full bg-zinc-800/50 flex items-center justify-center">
                                                    <FileText className="w-6 h-6 text-zinc-600" />
                                                </div>
                                                <p>No RFCs found. Draft your first proposal.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    rfcs.map((rfc) => {
                                        const status = statusConfig(rfc.status);
                                        const StatusIcon = status.icon;
                                        return (
                                            <tr
                                                key={rfc.id}
                                                onClick={() => navigate(`/governance/${rfc.id}`)}
                                                className="group hover:bg-white/5 cursor-pointer transition-colors"
                                            >
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.bg} ${status.color} ${status.border}`}>
                                                        <StatusIcon className="w-3.5 h-3.5" />
                                                        {rfc.status.charAt(0).toUpperCase() + rfc.status.slice(1)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-white group-hover:text-gable-green transition-colors">{rfc.title}</div>
                                                    <div className="text-xs text-zinc-500 font-mono mt-0.5">ID: {rfc.id.substring(0, 8)}</div>
                                                </td>
                                                <td className="px-6 py-4 text-zinc-400 max-w-md truncate">
                                                    {rfc.problem_statement}
                                                </td>
                                                <td className="px-6 py-4 text-right text-zinc-500 font-mono text-xs">
                                                    {new Date(rfc.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </PageTransition>
    );
}
