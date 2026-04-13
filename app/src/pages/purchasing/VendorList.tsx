import React, { useEffect, useState } from 'react';
import { VendorService } from '../../services/VendorService';
import type { Vendor } from '../../types/vendor';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Warehouse, Clock, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const VendorList: React.FC = () => {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        loadVendors();
    }, []);

    const loadVendors = async () => {
        try {
            const data = await VendorService.listVendors();
            setVendors(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-zinc-400">Loading vendors...</div>;

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                        Vendor Management
                    </h1>
                    <p className="text-zinc-400 mt-1">
                        Track performance, lead times, and spend across {vendors.length} vendor partners.
                    </p>
                </div>
                <Button variant="default" className="bg-emerald-600 hover:bg-emerald-500">
                    <Warehouse className="w-4 h-4 mr-2" />
                    New Vendor
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {vendors.map((vendor) => (
                    <Card key={vendor.id} variant="glass" className="hover:border-emerald-500/30 transition-all duration-300 group">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-lg text-white group-hover:text-emerald-400 transition-colors truncate">
                                    {vendor.name}
                                </CardTitle>
                                <div className={`px-2 py-0.5 rounded text-xs font-bold ${vendor.fill_rate >= 95 ? 'bg-emerald-500/20 text-emerald-300' :
                                    vendor.fill_rate >= 80 ? 'bg-amber-500/20 text-amber-300' :
                                        'bg-red-500/20 text-red-300'
                                    }`}>
                                    {vendor.fill_rate.toFixed(0)}% Fill Rate
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-zinc-500 text-xs flex items-center mb-1">
                                        <Clock className="w-3 h-3 mr-1" />
                                        Lead Time
                                    </p>
                                    <p className="text-zinc-200 font-mono">
                                        {vendor.average_lead_time_days.toFixed(1)} days
                                    </p>
                                </div>
                                <div>
                                    <p className="text-zinc-500 text-xs flex items-center mb-1">
                                        <DollarSign className="w-3 h-3 mr-1" />
                                        Spend YTD
                                    </p>
                                    <p className="text-zinc-200 font-mono">
                                        ${vendor.total_spend_ytd.toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            <div className="pt-3 border-t border-white/5 flex justify-between items-center">
                                <span className="text-xs text-zinc-500">{vendor.payment_terms}</span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs hover:bg-white/5"
                                    onClick={() => navigate(`/purchasing/vendors/${vendor.id}`)}
                                >
                                    View Scorecard
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {vendors.length === 0 && (
                <div className="text-center py-20 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed">
                    <Warehouse className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white">No Vendors Found</h3>
                    <p className="text-zinc-400 mt-2 max-w-sm mx-auto">
                        We couldn't find any vendors. Vendors are automatically created from product data, or you can add them manually.
                    </p>
                </div>
            )}
        </div>
    );
};

export default VendorList;
