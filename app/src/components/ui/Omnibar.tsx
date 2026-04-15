import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { ProductService } from "../../services/product.service";
import { CustomerService } from "../../services/CustomerService";
import type { Product } from "../../types/product";
import type { Customer } from "../../types/customer";
import { useNavigate } from "react-router-dom";

export const Omnibar = () => {
    const [open, setOpen] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", down);

        // Pre-fetch data
        Promise.all([
            ProductService.getProducts(),
            CustomerService.listCustomers()
        ]).then(([p, c]) => {
            setProducts(p);
            setCustomers(c);
        }).catch(err => {
            console.error('Omnibar prefetch failed:', err);
        });

        return () => document.removeEventListener("keydown", down);
    }, []);

    return (
        <div className="fixed top-0 left-0 z-50 w-full" style={{ pointerEvents: open ? 'auto' : 'none' }}>
            <Command.Dialog
                open={open}
                onOpenChange={setOpen}
                label="Global Search"
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] max-w-full bg-[#161821] border border-white/10 rounded-lg shadow-2xl overflow-hidden p-2"
            >
                <div className="flex items-center px-4 border-b border-white/5">
                    <Command.Input
                        className="w-full bg-transparent border-none outline-none py-4 text-white placeholder-white/50 font-mono"
                        placeholder="Search customers, products, or commands... (cmd+k)"
                    />
                </div>

                <Command.List className="max-h-[400px] overflow-y-auto p-2 scroll-py-2">
                    <Command.Empty className="py-6 text-center text-white/50">No results found.</Command.Empty>

                    <Command.Group heading="Actions" className="text-white/50 text-xs font-bold uppercase tracking-wider mb-2 px-2">
                        <Command.Item
                            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white hover:bg-white/5 cursor-pointer aria-selected:bg-[#00FFA3] aria-selected:text-black"
                            onSelect={() => {
                                navigate('/quotes/new');
                                setOpen(false);
                            }}
                        >
                            Create Quote
                        </Command.Item>
                        <Command.Item
                            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white hover:bg-white/5 cursor-pointer aria-selected:bg-[#00FFA3] aria-selected:text-black"
                            onSelect={() => {
                                navigate('/orders');
                                setOpen(false);
                            }}
                        >
                            View Orders
                        </Command.Item>
                    </Command.Group>

                    {customers.length > 0 && (
                        <Command.Group heading="Customers" className="text-white/50 text-xs font-bold uppercase tracking-wider mb-2 px-2 mt-4">
                            {customers.map((c) => (
                                <Command.Item
                                    key={c.id}
                                    value={c.name}
                                    className="flex items-center justify-between px-3 py-2 rounded-md text-sm text-white hover:bg-white/5 cursor-pointer aria-selected:bg-[#00FFA3] aria-selected:text-black"
                                    onSelect={() => {
                                        setOpen(false);
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <span>{c.name}</span>
                                        {c.credit_limit > 0 && c.balance_due > c.credit_limit && (
                                            <span className="text-red-500 text-[10px] border border-red-500 px-1 rounded uppercase font-bold">Hold</span>
                                        )}
                                    </div>
                                    <span className="opacity-50 text-xs">{c.account_number}</span>
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}

                    {products.length > 0 && (
                        <Command.Group heading="Products" className="text-white/50 text-xs font-bold uppercase tracking-wider mb-2 px-2 mt-4">
                            {products.map((p) => (
                                <Command.Item
                                    key={p.id}
                                    value={p.sku + " " + p.description}
                                    className="flex items-center justify-between px-3 py-2 rounded-md text-sm text-white hover:bg-white/5 cursor-pointer aria-selected:bg-[#00FFA3] aria-selected:text-black"
                                    onSelect={() => {
                                        setOpen(false);
                                    }}
                                >
                                    <span className="font-mono mr-2">{p.sku}</span>
                                    <span className="truncate">{p.description}</span>
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}
                </Command.List>
            </Command.Dialog>
            {open && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm -z-10" />}
        </div>
    );
};
