import { useState, useEffect } from 'react';
import { CustomerService } from '../../services/CustomerService';
import type { Customer } from '../../types/customer';
import { Card } from '../../components/ui/Card';
import { LoadingScreen } from '../../components/ui/LoadingScreen';
import { Link } from 'react-router-dom';
import { Search, DollarSign, Building2, User } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';

export function AccountsPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'credit' | 'cash'>('all');
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadCustomers();
    }, []);

    async function loadCustomers() {
        try {
            const data = await CustomerService.listCustomers();
            setCustomers(data);
        } catch (error) {
            console.error('Failed to load customers:', error);
            // Ideally use toast here
        } finally {
            setLoading(false);
        }
    }

    const filteredCustomers = customers.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.account_number.toLowerCase().includes(search.toLowerCase());

        if (!matchesSearch) return false;

        if (filter === 'credit') return c.credit_limit > 0;
        if (filter === 'cash') return c.credit_limit === 0;

        return true;
    });

    if (loading) return <LoadingScreen />;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Accounts</h1>
                    <p className="text-zinc-400 text-sm mt-1">Manage customer accounts, balances, and credit limits.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search accounts..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-slate-steel/50 border border-white/5 rounded-full py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50 w-64"
                        />
                    </div>

                    <div className="bg-slate-steel/50 p-1 rounded-lg flex items-center border border-white/5">
                        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
                        <FilterButton active={filter === 'credit'} onClick={() => setFilter('credit')} label="Credit" icon={<Building2 size={14} />} />
                        <FilterButton active={filter === 'cash'} onClick={() => setFilter('cash')} label="Cash" icon={<DollarSign size={14} />} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider border-b border-white/5">
                    <div className="col-span-4">Customer</div>
                    <div className="col-span-2">Account #</div>
                    <div className="col-span-2 text-right">Balance Due</div>
                    <div className="col-span-2 text-right">Credit Limit</div>
                    <div className="col-span-2 text-right">Status</div>
                </div>

                {filteredCustomers.map((customer) => (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={customer.id}
                    >
                        <Link to={`/accounts/${customer.id}`}>
                            <Card className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/5 transition-colors border-white/5 hover:border-gable-green/30 group">
                                <div className="col-span-4 flex items-center gap-3">
                                    <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                                        customer.credit_limit > 0
                                            ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    )}>
                                        {customer.credit_limit > 0 ? <Building2 size={18} /> : <User size={18} />}
                                    </div>
                                    <div>
                                        <div className="font-medium text-white group-hover:text-gable-green transition-colors">{customer.name}</div>
                                        <div className="text-xs text-zinc-500 truncate">{customer.email || 'No email'}</div>
                                    </div>
                                </div>
                                <div className="col-span-2 text-sm text-zinc-400 font-mono">{customer.account_number}</div>
                                <div className="col-span-2 text-right font-mono font-medium text-white">
                                    ${Number(customer.balance_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                                <div className="col-span-2 text-right font-mono text-zinc-400 text-sm">
                                    {customer.credit_limit > 0
                                        ? `$${Number(customer.credit_limit).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                        : <span className="text-zinc-600">-</span>
                                    }
                                </div>
                                <div className="col-span-2 flex justify-end">
                                    <Badge active={customer.is_active} />
                                </div>
                            </Card>
                        </Link>
                    </motion.div>
                ))}

                {filteredCustomers.length === 0 && (
                    <div className="text-center py-20 text-zinc-500">
                        No accounts found matching your filters.
                    </div>
                )}
            </div>
        </div>
    );
}

function FilterButton({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon?: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                active
                    ? "bg-zinc-700 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
            )}
        >
            {icon}
            {label}
        </button>
    )
}

function Badge({ active }: { active: boolean }) {
    return (
        <span className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium border",
            active
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
        )}>
            {active ? 'Active' : 'Inactive'}
        </span>
    )
}
