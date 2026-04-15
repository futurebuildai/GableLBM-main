import React, { useEffect, useState } from 'react';
import type { MatchResult, MatchException, MatchConfig } from '../../types/matching';
import { runMatch, listExceptions, getMatchConfig, updateMatchConfig, getMatchResult } from '../../services/MatchingService';
import { useToast } from '../../components/ui/ToastContext';

const POMatching: React.FC = () => {
    const { showToast } = useToast();
    const [exceptions, setExceptions] = useState<MatchException[]>([]);
    const [config, setConfig] = useState<MatchConfig | null>(null);
    const [selectedResult, setSelectedResult] = useState<MatchResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [runPoId, setRunPoId] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [exc, cfg] = await Promise.all([listExceptions(), getMatchConfig()]);
            setExceptions(exc);
            setConfig(cfg);
        } catch (err) {
            console.error('Failed to load matching data:', err);
            showToast('Failed to load PO matching data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRunMatch = async () => {
        if (!runPoId.trim()) return;
        try {
            setMessage('Running 3-way match...');
            const result = await runMatch(runPoId.trim());
            setSelectedResult(result);
            setMessage(`Match complete: ${result.status}`);
            loadData();
        } catch (err: unknown) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const handleViewResult = async (poId: string) => {
        try {
            const result = await getMatchResult(poId);
            setSelectedResult(result);
        } catch (err) {
            console.error('Failed to load result:', err);
            showToast('Failed to load match result', 'error');
        }
    };

    const handleUpdateConfig = async (field: string, value: number | boolean) => {
        if (!config) return;
        try {
            const updated = await updateMatchConfig({ [field]: value });
            setConfig(updated);
            setMessage('Config updated');
        } catch (err: unknown) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    const formatPct = (pct: number) => `${pct.toFixed(2)}%`;

    const statusBadge = (status: string) => {
        const colors: Record<string, string> = {
            MATCHED: '#22c55e',
            PARTIAL: '#eab308',
            EXCEPTION: '#ef4444',
            PENDING: '#6b7280',
        };
        return (
            <span style={{
                display: 'inline-block',
                padding: '2px 10px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                background: colors[status] || '#6b7280',
            }}>
                {status}
            </span>
        );
    };

    if (loading) {
        return <div style={{ padding: 32, color: '#94a3b8' }}>Loading matching data...</div>;
    }

    return (
        <div style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>3-Way PO Matching</h1>
            </div>

            {message && (
                <div style={{
                    padding: '10px 16px', marginBottom: 16, borderRadius: 8,
                    background: message.startsWith('Error') ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                    color: message.startsWith('Error') ? '#ef4444' : '#22c55e',
                    border: `1px solid ${message.startsWith('Error') ? '#ef444433' : '#22c55e33'}`,
                }}>
                    {message}
                </div>
            )}

            {/* Run Match Section */}
            <div style={{
                background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 24,
                border: '1px solid #334155',
            }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>Run Match</h2>
                <div style={{ display: 'flex', gap: 12 }}>
                    <input
                        type="text"
                        placeholder="Enter PO ID (UUID)"
                        value={runPoId}
                        onChange={e => setRunPoId(e.target.value)}
                        style={{
                            flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #475569',
                            background: '#0f172a', color: '#e2e8f0', fontSize: 14,
                        }}
                    />
                    <button
                        onClick={handleRunMatch}
                        style={{
                            padding: '8px 20px', borderRadius: 8, border: 'none',
                            background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        Run 3-Way Match
                    </button>
                </div>
            </div>

            {/* Config Section */}
            {config && (
                <div style={{
                    background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 24,
                    border: '1px solid #334155',
                }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>Tolerance Settings</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                        <div>
                            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Qty Tolerance %</label>
                            <input
                                type="number"
                                step="0.5"
                                value={config.qty_tolerance_pct}
                                onChange={e => handleUpdateConfig('qty_tolerance_pct', parseFloat(e.target.value))}
                                style={{
                                    width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #475569',
                                    background: '#0f172a', color: '#e2e8f0', fontSize: 14,
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Price Tolerance %</label>
                            <input
                                type="number"
                                step="0.5"
                                value={config.price_tolerance_pct}
                                onChange={e => handleUpdateConfig('price_tolerance_pct', parseFloat(e.target.value))}
                                style={{
                                    width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #475569',
                                    background: '#0f172a', color: '#e2e8f0', fontSize: 14,
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Dollar Tolerance</label>
                            <input
                                type="number"
                                step="1"
                                value={(config.dollar_tolerance / 100).toFixed(2)}
                                onChange={e => handleUpdateConfig('dollar_tolerance', Math.round(parseFloat(e.target.value) * 100))}
                                style={{
                                    width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #475569',
                                    background: '#0f172a', color: '#e2e8f0', fontSize: 14,
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Auto-Approve</label>
                            <button
                                onClick={() => handleUpdateConfig('auto_approve_on_match', !config.auto_approve_on_match)}
                                style={{
                                    width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #475569',
                                    background: config.auto_approve_on_match ? '#22c55e22' : '#0f172a',
                                    color: config.auto_approve_on_match ? '#22c55e' : '#94a3b8',
                                    fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                {config.auto_approve_on_match ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Exceptions Table */}
            <div style={{
                background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 24,
                border: '1px solid #334155',
            }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>
                    Exceptions ({exceptions.length})
                </h2>
                {exceptions.length === 0 ? (
                    <p style={{ color: '#64748b' }}>No exceptions found. All matches are clean.</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #334155' }}>
                                <th style={thStyle}>PO ID</th>
                                <th style={thStyle}>Status</th>
                                <th style={thStyle}>Lines</th>
                                <th style={thStyle}>Exceptions</th>
                                <th style={thStyle}>Notes</th>
                                <th style={thStyle}>Date</th>
                                <th style={thStyle}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {exceptions.map(e => (
                                <tr key={e.match_result_id} style={{ borderBottom: '1px solid #1e293b' }}>
                                    <td style={tdStyle}>
                                        <code style={{ fontSize: 11, color: '#94a3b8' }}>
                                            {e.po_id.substring(0, 8)}...
                                        </code>
                                    </td>
                                    <td style={tdStyle}>{statusBadge(e.status)}</td>
                                    <td style={tdStyle}>{e.line_count}</td>
                                    <td style={tdStyle}>
                                        <span style={{ color: '#ef4444', fontWeight: 600 }}>{e.exception_count}</span>
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{ fontSize: 13, color: '#94a3b8' }}>{e.notes}</span>
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{ fontSize: 13, color: '#94a3b8' }}>
                                            {new Date(e.created_at).toLocaleDateString()}
                                        </span>
                                    </td>
                                    <td style={tdStyle}>
                                        <button
                                            onClick={() => handleViewResult(e.po_id)}
                                            style={{
                                                padding: '4px 12px', borderRadius: 6, border: '1px solid #475569',
                                                background: 'transparent', color: '#3b82f6', cursor: 'pointer',
                                                fontSize: 12,
                                            }}
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Selected Match Result Detail */}
            {selectedResult && (
                <div style={{
                    background: '#1e293b', borderRadius: 12, padding: 20,
                    border: '1px solid #334155',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0' }}>
                            Match Detail: PO {selectedResult.po_id.substring(0, 8)}...
                        </h2>
                        {statusBadge(selectedResult.status)}
                    </div>
                    <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>{selectedResult.notes}</p>

                    {selectedResult.lines && selectedResult.lines.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #334155' }}>
                                    <th style={thStyle}>Description</th>
                                    <th style={thStyle}>PO Qty</th>
                                    <th style={thStyle}>Received</th>
                                    <th style={thStyle}>Invoiced</th>
                                    <th style={thStyle}>PO Cost</th>
                                    <th style={thStyle}>Inv Price</th>
                                    <th style={thStyle}>Qty Var</th>
                                    <th style={thStyle}>Price Var</th>
                                    <th style={thStyle}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedResult.lines.map(line => (
                                    <tr key={line.id} style={{
                                        borderBottom: '1px solid #1e293b',
                                        background: line.line_status === 'EXCEPTION' ? 'rgba(239,68,68,0.05)' : 'transparent',
                                    }}>
                                        <td style={tdStyle}>{line.description}</td>
                                        <td style={tdStyle}>{line.po_qty}</td>
                                        <td style={tdStyle}>{line.received_qty}</td>
                                        <td style={tdStyle}>{line.invoiced_qty}</td>
                                        <td style={tdStyle}>{formatCents(line.po_unit_cost)}</td>
                                        <td style={tdStyle}>{formatCents(line.invoice_unit_price)}</td>
                                        <td style={{
                                            ...tdStyle,
                                            color: Math.abs(line.qty_variance_pct) > 0 ? '#eab308' : '#22c55e',
                                        }}>
                                            {formatPct(line.qty_variance_pct)}
                                        </td>
                                        <td style={{
                                            ...tdStyle,
                                            color: Math.abs(line.price_variance_pct) > 2 ? '#ef4444' : '#22c55e',
                                        }}>
                                            {formatPct(line.price_variance_pct)}
                                        </td>
                                        <td style={tdStyle}>{statusBadge(line.line_status)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
};

const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 14,
    color: '#e2e8f0',
};

export default POMatching;
