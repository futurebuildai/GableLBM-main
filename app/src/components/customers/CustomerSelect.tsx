import { useEffect, useState } from 'react';
import type { Customer } from '../../types/customer';
import { CustomerService } from '../../services/CustomerService';
import { Search } from 'lucide-react';
import { useToast } from '../ui/ToastContext';

interface CustomerSelectProps {
    onSelect: (customer: Customer) => void;
    selectedCustomerId?: string;
}

export const CustomerSelect = ({ onSelect, selectedCustomerId }: CustomerSelectProps) => {
    const { showToast } = useToast();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const fetchCustomers = async () => {
            try {
                const data = await CustomerService.listCustomers();
                setCustomers(data);
            } catch (error) {
                console.error('Failed to load customers', error);
                showToast('Failed to load customers', 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchCustomers();
    }, [showToast]);

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.account_number.includes(searchTerm)
    );

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

    return (
        <div className="relative w-full max-w-sm">
            <label className="block text-sm font-medium text-gray-400 mb-1">Customer</label>

            <div className="relative">
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center w-full px-4 py-2 bg-[#161821] border border-white/10 rounded-md cursor-pointer hover:border-[#00FFA3] transition-colors"
                >
                    <Search className="w-4 h-4 text-gray-400 mr-2" />
                    <input
                        type="text"
                        className="bg-transparent border-none outline-none text-white w-full placeholder-gray-600 cursor-pointer"
                        placeholder="Select Customer..."
                        value={isOpen ? searchTerm : (selectedCustomer?.name || '')}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                    />
                </div>

                {isOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-[#161821] border border-white/10 rounded-md shadow-xl max-h-60 overflow-auto">
                        {loading && (
                            <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
                        )}

                        {!loading && filteredCustomers.length === 0 && (
                            <div className="p-4 text-center text-gray-500 text-sm">No results found</div>
                        )}

                        {!loading && filteredCustomers.map(customer => (
                            <div
                                key={customer.id}
                                className="px-4 py-2 hover:bg-[#00FFA3]/10 cursor-pointer flex justify-between items-center group"
                                onClick={() => {
                                    onSelect(customer);
                                    setSearchTerm('');
                                    setIsOpen(false);
                                }}
                            >
                                <div>
                                    <div className="text-white font-medium group-hover:text-[#00FFA3] transition-colors">{customer.name}</div>
                                    <div className="text-xs text-gray-500">#{customer.account_number}</div>
                                </div>
                                <div className="text-xs text-right text-gray-500">
                                    {customer.price_level?.name || 'Retail'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            )}
        </div>
    );
};
