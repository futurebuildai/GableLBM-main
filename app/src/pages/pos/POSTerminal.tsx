import React, { useState, useCallback, useRef, useEffect } from 'react';
import { posService } from '../../services/POSService';
import type { POSTransaction, QuickSearchResult, POSLineItem } from '../../types/pos';
import { BarcodeScanner } from '../../components/BarcodeScanner';

/**
 * POSTerminal — Full-screen retail counter sales interface.
 *
 * Design Goals:
 * - Seasonal hire can learn in < 10 minutes
 * - Ring up a 5-item sale in under 60 seconds
 * - Support split payments (cash + card + check + account)
 */

const POSTerminal: React.FC = () => {
    const [transaction, setTransaction] = useState<POSTransaction | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<QuickSearchResult[]>([]);
    const [showTender, setShowTender] = useState(false);
    const [tenderMethod, setTenderMethod] = useState<string>('');
    const [tenderAmount, setTenderAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const newTxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clear the auto-start timer on unmount to prevent setState on unmounted component
    useEffect(() => {
        return () => {
            if (newTxTimerRef.current) {
                clearTimeout(newTxTimerRef.current);
            }
            if (errorTimerRef.current) {
                clearTimeout(errorTimerRef.current);
            }
        };
    }, []);

    const handleScan = async (barcode: string) => {
        try {
            // A quick direct lookup, if API supports it. For now, search and take first.
            const results = await posService.searchProducts(barcode);
            if (results && results.length > 0) {
                const exactMatch = results.find(r => r.sku === barcode || r.product_id === barcode) || results[0];
                await addItem(exactMatch);
            } else {
                setError(`Product not found for barcode: ${barcode}`);
                errorTimerRef.current = setTimeout(() => setError(null), 3000);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error scanning barcode');
        }
    };

    // Product search with debounce
    useEffect(() => {
        if (searchQuery.length < 2) {
            setSearchResults([]);
            return;
        }
        const timeout = setTimeout(async () => {
            try {
                const results = await posService.searchProducts(searchQuery);
                setSearchResults(results);
            } catch {
                setSearchResults([]);
            }
        }, 200);
        return () => clearTimeout(timeout);
    }, [searchQuery]);

    const startNewTransaction = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            setSuccess(null);
            // TODO: Replace with real cashier ID from auth context once available
            const cashierId = localStorage.getItem('user_id') || '';
            if (!cashierId) {
                setError('No cashier ID found. Please log in again.');
                return;
            }
            const tx = await posService.startTransaction('REG-01', cashierId);
            setTransaction(tx);
            setShowTender(false);
            searchRef.current?.focus();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to start transaction');
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-start a new transaction on mount
    useEffect(() => {
        startNewTransaction();
    }, [startNewTransaction]);

    const addItem = useCallback(async (product: QuickSearchResult) => {
        if (!transaction) return;
        try {
            const updated = await posService.addItem(transaction.id, {
                product_id: product.product_id,
                quantity: 1,
                uom: product.uom,
            });
            setTransaction(updated);
            setSearchQuery('');
            setSearchResults([]);
            searchRef.current?.focus();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to add item');
        }
    }, [transaction]);

    const removeItem = useCallback(async (itemId: string) => {
        if (!transaction) return;
        try {
            const updated = await posService.removeItem(transaction.id, itemId);
            setTransaction(updated);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to remove item');
        }
    }, [transaction]);

    const handleTender = useCallback(async (method: string) => {
        if (!transaction) return;
        setTenderMethod(method);
        setTenderAmount((transaction.total / 100).toFixed(2));
        setShowTender(true);
    }, [transaction]);

    const completeSale = useCallback(async () => {
        if (!transaction || !tenderMethod) return;
        try {
            setLoading(true);
            setError(null);
            const amount = parseFloat(tenderAmount);
            if (isNaN(amount) || amount <= 0) {
                setError('Invalid tender amount');
                return;
            }

            const completed = await posService.completeTransaction(transaction.id, [{
                method: tenderMethod,
                amount,
            }]);
            setTransaction(completed);
            setSuccess(`Sale completed! Total: $${(completed.total / 100).toFixed(2)}`);
            setShowTender(false);

            // Auto-start new transaction after 2 seconds
            newTxTimerRef.current = setTimeout(() => {
                startNewTransaction();
            }, 2000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to complete sale');
        } finally {
            setLoading(false);
        }
    }, [transaction, tenderMethod, tenderAmount, startNewTransaction]);

    const voidTransaction = useCallback(async () => {
        if (!transaction) return;
        if (!window.confirm('Void this transaction?')) return;
        try {
            await posService.voidTransaction(transaction.id);
            startNewTransaction();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to void transaction');
        }
    }, [transaction, startNewTransaction]);

    const totalDollars = transaction ? (transaction.total / 100).toFixed(2) : '0.00';
    const subtotalDollars = transaction ? (transaction.subtotal / 100).toFixed(2) : '0.00';
    const taxDollars = transaction ? (transaction.tax_amount / 100).toFixed(2) : '0.00';
    const lineItems = transaction?.line_items || [];

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <h1 style={styles.title}>⊞ POS Terminal</h1>
                    <span style={styles.registerBadge}>REG-01</span>
                    {transaction && (
                        <span style={styles.txBadge}>
                            TX: {transaction.id.slice(0, 8)}
                        </span>
                    )}
                </div>
                <div style={styles.headerRight}>
                    <button onClick={startNewTransaction} style={styles.headerBtn}>
                        New Sale
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <div style={styles.alert}>{error}
                    <button onClick={() => setError(null)} style={styles.alertClose} aria-label="Dismiss error">×</button>
                </div>
            )}
            {success && (
                <div style={styles.successAlert}>{success}</div>
            )}

            {/* Main Layout */}
            <div style={styles.main}>
                {/* Left: Cart */}
                <div style={styles.cartPanel}>
                    {/* Search Bar */}
                    <div style={styles.searchContainer}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                ref={searchRef}
                                type="text"
                                placeholder="🔍 Search product by SKU or description..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{ ...styles.searchInput, flex: 1 }}
                                autoFocus
                                aria-label="Search product by SKU or description"
                            />
                            <button
                                onClick={() => setIsScanning(true)}
                                style={{
                                    background: '#238636',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    padding: '0 16px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                📷 Scan
                            </button>
                        </div>
                        {isScanning && (
                            <BarcodeScanner
                                onScan={(barcode) => {
                                    setIsScanning(false);
                                    handleScan(barcode);
                                }}
                                onClose={() => setIsScanning(false)}
                            />
                        )}
                        {searchResults.length > 0 && (
                            <div style={styles.searchDropdown}>
                                {searchResults.map(result => (
                                    <button
                                        key={result.product_id}
                                        onClick={() => addItem(result)}
                                        style={styles.searchResult}
                                    >
                                        <span style={styles.resultSku}>{result.sku}</span>
                                        <span style={styles.resultDesc}>{result.description}</span>
                                        <span style={styles.resultPrice}>${result.unit_price.toFixed(2)}/{result.uom}</span>
                                        <span style={styles.resultStock}>{result.in_stock} avail</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Line Items */}
                    <div style={styles.cartItems}>
                        {lineItems.length === 0 ? (
                            <div style={styles.emptyCart}>
                                <div style={styles.emptyCartIcon}>🛒</div>
                                <p>Search and add products to start a sale</p>
                            </div>
                        ) : (
                            <table style={styles.itemsTable} aria-label="Cart items">
                                <thead>
                                    <tr>
                                        <th style={styles.th}>Item</th>
                                        <th style={{ ...styles.th, textAlign: 'center' }}>Qty</th>
                                        <th style={{ ...styles.th, textAlign: 'right' }}>Price</th>
                                        <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
                                        <th style={{ ...styles.th, width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineItems.map((item: POSLineItem) => (
                                        <tr key={item.id} style={styles.itemRow}>
                                            <td style={styles.td}>{item.description}</td>
                                            <td style={{ ...styles.td, textAlign: 'center' }}>
                                                {item.quantity} {item.uom}
                                            </td>
                                            <td style={{ ...styles.td, textAlign: 'right' }}>
                                                ${(item.unit_price / 100).toFixed(2)}
                                            </td>
                                            <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>
                                                ${(item.line_total / 100).toFixed(2)}
                                            </td>
                                            <td style={styles.td}>
                                                <button
                                                    onClick={() => removeItem(item.id)}
                                                    style={styles.removeBtn}
                                                    title="Remove"
                                                    aria-label={`Remove ${item.description}`}
                                                >×</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Right: Totals + Tenders */}
                <div style={styles.tenderPanel}>
                    <div style={styles.totals}>
                        <div style={styles.totalRow}>
                            <span>Subtotal</span>
                            <span>${subtotalDollars}</span>
                        </div>
                        <div style={styles.totalRow}>
                            <span>Tax</span>
                            <span>${taxDollars}</span>
                        </div>
                        <div style={styles.totalRowFinal}>
                            <span>TOTAL</span>
                            <span style={styles.totalAmount}>${totalDollars}</span>
                        </div>
                    </div>

                    {!showTender ? (
                        <div style={styles.tenderButtons}>
                            <button onClick={() => handleTender('CASH')} style={styles.tenderBtn} disabled={lineItems.length === 0}>
                                💵 Cash
                            </button>
                            <button onClick={() => handleTender('CARD')} style={styles.tenderBtn} disabled={lineItems.length === 0}>
                                💳 Card
                            </button>
                            <button onClick={() => handleTender('CHECK')} style={styles.tenderBtn} disabled={lineItems.length === 0}>
                                📝 Check
                            </button>
                            <button onClick={() => handleTender('ACCOUNT')} style={styles.tenderBtn} disabled={lineItems.length === 0}>
                                📋 Account
                            </button>
                        </div>
                    ) : (
                        <div style={styles.tenderForm}>
                            <div style={styles.tenderMethodLabel}>
                                {tenderMethod === 'CASH' && '💵'}
                                {tenderMethod === 'CARD' && '💳'}
                                {tenderMethod === 'CHECK' && '📝'}
                                {tenderMethod === 'ACCOUNT' && '📋'}
                                {' '}{tenderMethod}
                            </div>
                            <input
                                type="number"
                                value={tenderAmount}
                                onChange={e => setTenderAmount(e.target.value)}
                                style={styles.tenderInput}
                                step="0.01"
                                autoFocus
                                aria-label="Tender amount"
                            />
                            <button
                                onClick={completeSale}
                                style={styles.completeBtn}
                                disabled={loading}
                            >
                                {loading ? 'Processing...' : `Complete Sale — $${totalDollars}`}
                            </button>
                            <button
                                onClick={() => setShowTender(false)}
                                style={styles.cancelTenderBtn}
                            >
                                Cancel
                            </button>
                        </div>
                    )}

                    {/* Quick Actions */}
                    <div style={styles.quickActions}>
                        <button onClick={voidTransaction} style={styles.voidBtn} disabled={!transaction || lineItems.length === 0}>
                            Void
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ---- Dark theme styles ----
const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0d1117',
        color: '#e6edf3',
        fontFamily: "'Outfit', -apple-system, sans-serif",
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        background: '#161b22',
        borderBottom: '1px solid #21262d',
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    title: {
        fontSize: '18px',
        fontWeight: '700',
        margin: 0,
        color: '#e6edf3',
    },
    registerBadge: {
        fontSize: '11px',
        padding: '2px 8px',
        background: '#238636',
        borderRadius: '12px',
        color: '#fff',
        fontWeight: '600',
    },
    txBadge: {
        fontSize: '11px',
        padding: '2px 8px',
        background: '#1f6feb',
        borderRadius: '12px',
        color: '#fff',
        fontFamily: 'monospace',
    },
    headerRight: {
        display: 'flex',
        gap: '8px',
    },
    headerBtn: {
        padding: '6px 16px',
        background: '#21262d',
        border: '1px solid #30363d',
        borderRadius: '6px',
        color: '#c9d1d9',
        fontSize: '13px',
        cursor: 'pointer',
    },
    alert: {
        padding: '10px 16px',
        background: '#3d1114',
        borderBottom: '1px solid #f8514940',
        color: '#f85149',
        fontSize: '13px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    alertClose: {
        background: 'none',
        border: 'none',
        color: '#f85149',
        fontSize: '16px',
        cursor: 'pointer',
    },
    successAlert: {
        padding: '10px 16px',
        background: '#0d2818',
        borderBottom: '1px solid #2ea04340',
        color: '#3fb950',
        fontSize: '14px',
        fontWeight: '600',
        textAlign: 'center' as const,
    },
    main: {
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
    },
    cartPanel: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #21262d',
    },
    searchContainer: {
        position: 'relative' as const,
        padding: '16px',
        borderBottom: '1px solid #21262d',
    },
    searchInput: {
        width: '100%',
        padding: '12px 16px',
        background: '#0d1117',
        border: '2px solid #30363d',
        borderRadius: '8px',
        color: '#e6edf3',
        fontSize: '16px',
        outline: 'none',
        boxSizing: 'border-box' as const,
    },
    searchDropdown: {
        position: 'absolute' as const,
        top: '100%',
        left: '16px',
        right: '16px',
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '8px',
        zIndex: 10,
        maxHeight: '300px',
        overflowY: 'auto' as const,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    },
    searchResult: {
        display: 'flex',
        width: '100%',
        padding: '10px 14px',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid #21262d',
        color: '#e6edf3',
        cursor: 'pointer',
        textAlign: 'left' as const,
        gap: '12px',
        alignItems: 'center',
        fontSize: '13px',
    },
    resultSku: {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#58a6ff',
        minWidth: '100px',
    },
    resultDesc: {
        flex: 1,
        color: '#c9d1d9',
    },
    resultPrice: {
        fontWeight: '600',
        color: '#3fb950',
    },
    resultStock: {
        fontSize: '11px',
        color: '#8b949e',
    },
    cartItems: {
        flex: 1,
        overflowY: 'auto' as const,
        padding: '8px 16px',
    },
    emptyCart: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#484f58',
    },
    emptyCartIcon: {
        fontSize: '48px',
        marginBottom: '12px',
    },
    itemsTable: {
        width: '100%',
        borderCollapse: 'collapse' as const,
    },
    th: {
        textAlign: 'left' as const,
        padding: '8px 12px',
        fontSize: '11px',
        color: '#8b949e',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        borderBottom: '1px solid #21262d',
    },
    td: {
        padding: '10px 12px',
        fontSize: '14px',
        borderBottom: '1px solid #161b22',
    },
    itemRow: {},
    removeBtn: {
        background: 'none',
        border: 'none',
        color: '#f85149',
        fontSize: '18px',
        cursor: 'pointer',
        padding: '2px 6px',
        borderRadius: '4px',
    },
    tenderPanel: {
        width: '360px',
        display: 'flex',
        flexDirection: 'column',
        background: '#161b22',
        padding: '24px',
    },
    totals: {
        marginBottom: '24px',
    },
    totalRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        fontSize: '14px',
        color: '#8b949e',
    },
    totalRowFinal: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '12px 0',
        fontSize: '16px',
        fontWeight: '700',
        color: '#e6edf3',
        borderTop: '1px solid #30363d',
        marginTop: '8px',
    },
    totalAmount: {
        fontSize: '28px',
        fontWeight: '800',
        color: '#3fb950',
    },
    tenderButtons: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        flex: 1,
    },
    tenderBtn: {
        padding: '20px',
        background: '#21262d',
        border: '1px solid #30363d',
        borderRadius: '12px',
        color: '#e6edf3',
        fontSize: '15px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.15s',
        textAlign: 'center' as const,
    },
    tenderForm: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    tenderMethodLabel: {
        fontSize: '18px',
        fontWeight: '700',
        textAlign: 'center' as const,
        padding: '8px',
    },
    tenderInput: {
        padding: '14px',
        background: '#0d1117',
        border: '2px solid #238636',
        borderRadius: '8px',
        color: '#e6edf3',
        fontSize: '24px',
        fontWeight: '700',
        textAlign: 'center' as const,
        outline: 'none',
    },
    completeBtn: {
        padding: '16px',
        background: '#238636',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '16px',
        fontWeight: '700',
        cursor: 'pointer',
        marginTop: '8px',
    },
    cancelTenderBtn: {
        padding: '10px',
        background: 'transparent',
        border: '1px solid #30363d',
        borderRadius: '8px',
        color: '#8b949e',
        fontSize: '14px',
        cursor: 'pointer',
    },
    quickActions: {
        padding: '16px 0',
        marginTop: 'auto',
        display: 'flex',
        gap: '8px',
    },
    voidBtn: {
        flex: 1,
        padding: '10px',
        background: 'transparent',
        border: '1px solid #f8514940',
        borderRadius: '8px',
        color: '#f85149',
        fontSize: '13px',
        cursor: 'pointer',
    },
};

export default POSTerminal;
