import React, { useState, useCallback, useEffect } from 'react';
import { paymentService } from '../../services/paymentService';
import type { Payment } from '../../types/payment';

declare global {
    interface Window {
        Runner?: {
            init(opts: Record<string, unknown>): void;
            createToken(): Promise<{ token: string }>;
        };
    }
}

/**
 * RunPaymentsForm — PCI-compliant card input component.
 *
 * This component integrates with Run Payments' Runner.js for tokenization.
 * Card data is captured in Runner.js' secure iframe — it never touches our DOM or servers.
 *
 * Flow:
 *  1. Parent calls this with invoiceId and amount
 *  2. We fetch the public key via /api/payments/intent
 *  3. Runner.js renders a secure card input iframe
 *  4. On submit, Runner.js tokenizes → we send token to /api/payments/card
 *  5. onSuccess callback fires with the completed Payment
 *
 * When Run Payments is not configured (dev/demo), falls back to a manual card entry form
 * that simulates the flow with a fake token.
 */

interface RunPaymentsFormProps {
    invoiceId: string;
    amountCents: number; // In cents
    onSuccess: (payment: Payment) => void;
    onError: (error: string) => void;
    onCancel: () => void;
}

const RunPaymentsForm: React.FC<RunPaymentsFormProps> = ({
    invoiceId,
    amountCents,
    onSuccess,
    onError,
    onCancel,
}) => {
    const displayAmount = (amountCents / 100).toFixed(2);
    const [loading, setLoading] = useState(false);
    const [, setPublicKey] = useState<string | null>(null);
    const [initError] = useState<string | null>(null);
    const [notes, setNotes] = useState('');

    // Demo/fallback state (when gateway is not configured)
    const [demoMode, setDemoMode] = useState(false);
    const [demoCardNumber, setDemoCardNumber] = useState('');

    // Fetch the public key on mount
    useEffect(() => {
        const fetchIntent = async () => {
            try {
                const intent = await paymentService.createPaymentIntent({
                    invoice_id: invoiceId,
                    amount: amountCents,
                });
                setPublicKey(intent.public_key);

                // Initialize Runner.js with the public key
                // In production, this would load the Runner.js script and mount the secure iframe
                if (typeof window.Runner !== 'undefined') {
                    window.Runner.init({
                        publicKey: intent.public_key,
                        container: '#run-payments-container',
                    });
                }
            } catch (err: unknown) {
                // Gateway not configured — fall back to demo mode
                console.warn('Run Payments not available, using demo mode:', err instanceof Error ? err.message : 'Unknown error');
                setDemoMode(true);
            }
        };
        fetchIntent();
    }, [invoiceId, amountCents]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            let tokenId: string;

            if (demoMode) {
                // Demo mode: create a fake token
                tokenId = `demo_tok_${Date.now()}`;
            } else if (typeof window.Runner !== 'undefined') {
                // Production mode: get token from Runner.js
                const result = await window.Runner.createToken();
                tokenId = result.token;
            } else {
                throw new Error('Runner.js not loaded');
            }

            // Process the card payment through our backend
            const payment = await paymentService.processCardPayment({
                invoice_id: invoiceId,
                token_id: tokenId,
                amount: amountCents,
                notes,
            });

            onSuccess(payment);
        } catch (err: unknown) {
            onError(err instanceof Error ? err.message : 'Card payment failed');
        } finally {
            setLoading(false);
        }
    }, [invoiceId, amountCents, notes, demoMode, onSuccess, onError]);

    if (initError) {
        return (
            <div style={styles.errorContainer}>
                <p style={styles.errorText}>⚠️ {initError}</p>
                <button onClick={onCancel} style={styles.cancelButton}>Cancel</button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.header}>
                <div style={styles.amountDisplay}>
                    <span style={styles.amountLabel}>Charge Amount</span>
                    <span style={styles.amountValue}>${displayAmount}</span>
                </div>
                <div style={styles.poweredBy}>
                    Powered by <strong>Run Payments</strong>
                </div>
            </div>

            {/* Card input area */}
            <div style={styles.cardSection}>
                {demoMode ? (
                    // Demo fallback: simple card number input
                    <div>
                        <div style={styles.demoBanner}>
                            🏗️ Demo Mode — No live gateway configured
                        </div>
                        <label style={styles.label}>Card Number (demo)</label>
                        <input
                            type="text"
                            placeholder="4242 4242 4242 4242"
                            value={demoCardNumber}
                            onChange={e => setDemoCardNumber(e.target.value)}
                            style={styles.input}
                            maxLength={19}
                        />
                    </div>
                ) : (
                    // Production: Runner.js secure iframe mounts here
                    <div>
                        <label style={styles.label}>Card Details</label>
                        <div
                            id="run-payments-container"
                            style={styles.runnerContainer}
                        >
                            {/* Runner.js iframe renders here */}
                            <div style={styles.runnerPlaceholder}>
                                Loading secure payment form...
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Notes */}
            <div style={styles.fieldGroup}>
                <label style={styles.label}>Notes (optional)</label>
                <input
                    type="text"
                    placeholder="e.g., Customer phone order"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    style={styles.input}
                />
            </div>

            {/* Actions */}
            <div style={styles.actions}>
                <button
                    type="button"
                    onClick={onCancel}
                    style={styles.cancelButton}
                    disabled={loading}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    style={styles.submitButton}
                    disabled={loading}
                >
                    {loading ? 'Processing...' : `Charge $${displayAmount}`}
                </button>
            </div>
        </form>
    );
};

// ---- Styles ----
const styles: Record<string, React.CSSProperties> = {
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '24px',
        background: '#0f1419',
        borderRadius: '12px',
        border: '1px solid #2a3441',
        maxWidth: '480px',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '16px',
        borderBottom: '1px solid #2a3441',
    },
    amountDisplay: {
        display: 'flex',
        flexDirection: 'column',
    },
    amountLabel: {
        fontSize: '12px',
        color: '#8b949e',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
    },
    amountValue: {
        fontSize: '28px',
        fontWeight: '700',
        color: '#e6edf3',
    },
    poweredBy: {
        fontSize: '11px',
        color: '#6e7681',
    },
    cardSection: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    demoBanner: {
        padding: '8px 12px',
        background: '#1a1f2e',
        border: '1px solid #3a4553',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#f0c040',
        marginBottom: '12px',
        textAlign: 'center' as const,
    },
    label: {
        fontSize: '13px',
        fontWeight: '600',
        color: '#c9d1d9',
        marginBottom: '4px',
    },
    input: {
        padding: '10px 14px',
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
        color: '#e6edf3',
        fontSize: '14px',
        width: '100%',
        boxSizing: 'border-box' as const,
        outline: 'none',
    },
    runnerContainer: {
        minHeight: '60px',
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
        padding: '12px',
    },
    runnerPlaceholder: {
        color: '#6e7681',
        fontSize: '13px',
        textAlign: 'center' as const,
    },
    fieldGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    actions: {
        display: 'flex',
        gap: '12px',
        justifyContent: 'flex-end',
        paddingTop: '12px',
    },
    cancelButton: {
        padding: '10px 20px',
        background: 'transparent',
        border: '1px solid #30363d',
        borderRadius: '8px',
        color: '#c9d1d9',
        fontSize: '14px',
        cursor: 'pointer',
    },
    submitButton: {
        padding: '10px 24px',
        background: '#238636',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
    },
    errorContainer: {
        padding: '24px',
        textAlign: 'center' as const,
    },
    errorText: {
        color: '#f85149',
        marginBottom: '16px',
    },
};

export default RunPaymentsForm;
