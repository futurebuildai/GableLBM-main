import React, { useState, useEffect } from 'react';
import type { CreatePaymentRequest, PaymentMethod } from '../../types/payment';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (payment: CreatePaymentRequest) => Promise<void>;
    invoiceId: string;
    amountDue: number;
}

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'CHECK', 'ACCOUNT'];

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onSave, invoiceId, amountDue }) => {
    // amountDue is in cents; display input is in dollars
    const [amountDollars, setAmountDollars] = useState<number>(amountDue / 100);

    useEffect(() => {
        setAmountDollars(amountDue / 100);
    }, [amountDue]);

    const [method, setMethod] = useState<PaymentMethod>('CARD');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            const amountCents = Math.round(amountDollars * 100);
            await onSave({ invoice_id: invoiceId, amount: amountCents, method, reference, notes });
            onClose();
            // Reset
            setAmountDollars(0);
            setMethod('CARD');
            setReference('');
            setNotes('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to record payment');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-6">
                <div className="mb-6">
                    <h2 id="payment-modal-title" className="text-xl font-bold text-zinc-100">Record Payment</h2>
                    <p className="text-zinc-400 text-sm mt-1">Apply payment to Invoice</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 rounded text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Amount</label>
                        <input
                            type="number"
                            required
                            min="0.01"
                            step="0.01"
                            value={amountDollars}
                            onChange={(e) => setAmountDollars(parseFloat(e.target.value))}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Method</label>
                        <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                            {PAYMENT_METHODS.map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Reference (Check # / Transaction ID)</label>
                        <input
                            type="text"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder="Optional"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Notes</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            rows={2}
                            placeholder="Optional"
                        />
                    </div>

                    <div className="mt-8 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-zinc-300 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? 'Processing...' : 'Record Payment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
