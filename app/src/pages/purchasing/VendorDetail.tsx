import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { VendorService } from '../../services/VendorService';
import type { Vendor } from '../../types/vendor';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, TrendingUp, Clock, DollarSign, Truck } from 'lucide-react';
// import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const VendorDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (id) loadVendor(id);
    }, [id]);

    const loadVendor = async (vendorId: string) => {
        setError(null);
        setLoading(true);
        try {
            const data = await VendorService.getVendor(vendorId);
            setVendor(data);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to load vendor');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-zinc-400">Loading vendor...</div>;
    if (error) return (
        <div className="p-8 text-center space-y-4">
            <p className="text-red-400">{error}</p>
            <Button variant="outline" onClick={() => id && loadVendor(id)}>
                Retry
            </Button>
        </div>
    );
    if (!vendor) return <div className="p-8 text-center text-zinc-400">Vendor not found</div>;

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" size="icon" onClick={() => navigate('/purchasing/vendors')}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-white">{vendor.name}</h1>
                    <div className="flex gap-4 text-sm text-zinc-400 mt-1">
                        <span>{vendor.contact_email || 'No email'}</span>
                        <span>•</span>
                        <span>{vendor.phone || 'No phone'}</span>
                        <span>•</span>
                        <span className="text-emerald-400">{vendor.payment_terms}</span>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card variant="glass" className="border-l-4 border-l-emerald-500">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-sm text-zinc-400 font-medium uppercase tracking-wide">Fill Rate</p>
                                <h3 className="text-3xl font-bold text-white mt-1">{vendor.fill_rate.toFixed(1)}%</h3>
                            </div>
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <Truck className="w-5 h-5 text-emerald-400" />
                            </div>
                        </div>
                        <p className="text-xs text-emerald-400 flex items-center">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            Acceptable Range (&gt;95%)
                        </p>
                    </CardContent>
                </Card>

                <Card variant="glass" className="border-l-4 border-l-blue-500">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-sm text-zinc-400 font-medium uppercase tracking-wide">Avg Lead Time</p>
                                <h3 className="text-3xl font-bold text-white mt-1">{vendor.average_lead_time_days.toFixed(1)} <span className="text-sm font-normal text-zinc-500">days</span></h3>
                            </div>
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Clock className="w-5 h-5 text-blue-400" />
                            </div>
                        </div>
                        <p className="text-xs text-zinc-500">
                            Measured from PO Create to Receipt
                        </p>
                    </CardContent>
                </Card>

                <Card variant="glass" className="border-l-4 border-l-amber-500">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-sm text-zinc-400 font-medium uppercase tracking-wide">Spend YTD</p>
                                <h3 className="text-3xl font-bold text-white mt-1">${vendor.total_spend_ytd.toLocaleString()}</h3>
                            </div>
                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                <DollarSign className="w-5 h-5 text-amber-400" />
                            </div>
                        </div>
                        <p className="text-xs text-zinc-500">
                            Total value of received goods
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Placeholder for Historical Chart */}
            <Card variant="glass">
                <CardHeader>
                    <CardTitle>Performance History</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="h-64 flex items-center justify-center text-zinc-500 bg-black/20 rounded-lg border border-dashed border-zinc-800">
                        <p>Historical trend data requires more history.</p>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
};

export default VendorDetail;
