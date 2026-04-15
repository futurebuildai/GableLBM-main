import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { BankAccount, BankTransaction, ReconciliationSession } from '../../types/bankrecon';
import {
    listBankAccounts,
    createBankAccount,
    importStatement,
    createSession,
    getSession,
    listSessions,
    matchTransaction,
    unmatchTransaction,
    completeSession,
} from '../../services/BankReconService';
import { useToast } from '../../components/ui/ToastContext';

const BankReconciliation: React.FC = () => {
    const { showToast } = useToast();
    const jeMatchInputRef = useRef<HTMLInputElement>(null);
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [sessions, setSessions] = useState<ReconciliationSession[]>([]);
    const [activeSession, setActiveSession] = useState<ReconciliationSession | null>(null);
    const [selectedBankTxn, setSelectedBankTxn] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [tab, setTab] = useState<'sessions' | 'accounts'>('sessions');

    // New account form
    const [newAcctName, setNewAcctName] = useState('');
    const [newAcctNumber, setNewAcctNumber] = useState('');
    const [newAcctRouting, setNewAcctRouting] = useState('');
    const [newAcctGLID, setNewAcctGLID] = useState('');

    // New session form
    const [newSessionAcctId, setNewSessionAcctId] = useState('');
    const [newSessionStart, setNewSessionStart] = useState('');
    const [newSessionEnd, setNewSessionEnd] = useState('');
    const [newSessionBalance, setNewSessionBalance] = useState('');

    // Import form
    const [importAcctId, setImportAcctId] = useState('');
    const [csvContent, setCsvContent] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [accts, sess] = await Promise.all([listBankAccounts(), listSessions()]);
            setAccounts(accts);
            setSessions(sess);
        } catch (err) {
            console.error('Failed to load bank recon data:', err);
            showToast('Failed to load bank reconciliation data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateAccount = async () => {
        try {
            await createBankAccount({
                name: newAcctName,
                account_number: newAcctNumber,
                routing_number: newAcctRouting,
                gl_account_id: newAcctGLID,
            });
            setMessage('Bank account created');
            setNewAcctName(''); setNewAcctNumber(''); setNewAcctRouting(''); setNewAcctGLID('');
            loadData();
        } catch (err: unknown) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const handleImport = async () => {
        try {
            const result = await importStatement({
                bank_account_id: importAcctId,
                csv_content: csvContent,
            });
            setMessage(`Imported ${result.imported_rows} rows, auto-matched ${result.auto_matched}`);
            setCsvContent('');
            if (activeSession) {
                const updated = await getSession(activeSession.id);
                setActiveSession(updated);
            }
        } catch (err: unknown) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const handleCreateSession = async () => {
        try {
            const session = await createSession({
                bank_account_id: newSessionAcctId,
                period_start: newSessionStart,
                period_end: newSessionEnd,
                statement_balance: parseFloat(newSessionBalance),
            });
            setMessage('Session created');
            setActiveSession(session);
            loadData();
        } catch (err: unknown) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const handleOpenSession = async (id: string) => {
        try {
            const session = await getSession(id);
            setActiveSession(session);
        } catch (err: unknown) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const handleMatch = useCallback(async (bankTxnId: string, journalEntryId: string) => {
        try {
            await matchTransaction({ bank_transaction_id: bankTxnId, journal_entry_id: journalEntryId });
            if (activeSession) {
                const updated = await getSession(activeSession.id);
                setActiveSession(updated);
            }
            setSelectedBankTxn(null);
            setMessage('Transaction matched');
        } catch (err: unknown) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }, [activeSession]);

    const handleUnmatch = async (bankTxnId: string) => {
        try {
            await unmatchTransaction(bankTxnId);
            if (activeSession) {
                const updated = await getSession(activeSession.id);
                setActiveSession(updated);
            }
            setMessage('Transaction unmatched');
        } catch (err: unknown) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const handleComplete = async () => {
        if (!activeSession) return;
        try {
            const session = await completeSession(activeSession.id);
            setActiveSession(session);
            setMessage('Reconciliation completed');
            loadData();
        } catch (err: unknown) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const formatCents = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(2)}${cents < 0 ? ' DR' : ''}`;

    const statusColor = (status: string) => {
        return status === 'MATCHED' ? '#22c55e' : status === 'EXCLUDED' ? '#6b7280' : '#eab308';
    };

    if (loading) {
        return <div style={{ padding: 32, color: '#94a3b8' }}>Loading bank reconciliation data...</div>;
    }

    return (
        <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>Bank Reconciliation</h1>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={() => { setTab('sessions'); setActiveSession(null); }}
                        style={{
                            padding: '6px 16px', borderRadius: 8, border: '1px solid #475569',
                            background: tab === 'sessions' ? '#3b82f6' : 'transparent',
                            color: tab === 'sessions' ? '#fff' : '#94a3b8', cursor: 'pointer',
                        }}
                    >
                        Sessions
                    </button>
                    <button
                        onClick={() => setTab('accounts')}
                        style={{
                            padding: '6px 16px', borderRadius: 8, border: '1px solid #475569',
                            background: tab === 'accounts' ? '#3b82f6' : 'transparent',
                            color: tab === 'accounts' ? '#fff' : '#94a3b8', cursor: 'pointer',
                        }}
                    >
                        Bank Accounts
                    </button>
                </div>
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

            {/* Active Session View */}
            {activeSession && (
                <div style={{ marginBottom: 24 }}>
                    {/* Summary Bar */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 20,
                    }}>
                        {[
                            { label: 'Statement Balance', value: formatCents(activeSession.statement_balance), color: '#3b82f6' },
                            { label: 'GL Balance', value: formatCents(activeSession.gl_balance), color: '#8b5cf6' },
                            { label: 'Cleared', value: `${activeSession.cleared_count} items (${formatCents(activeSession.cleared_total)})`, color: '#22c55e' },
                            { label: 'Outstanding', value: `${activeSession.outstanding_count} items (${formatCents(activeSession.outstanding_total)})`, color: '#eab308' },
                            { label: 'Difference', value: formatCents(activeSession.difference), color: activeSession.difference === 0 ? '#22c55e' : '#ef4444' },
                        ].map((item, i) => (
                            <div key={i} style={{
                                background: '#1e293b', borderRadius: 12, padding: 16,
                                border: '1px solid #334155',
                            }}>
                                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{item.label}</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Import & Actions */}
                    <div style={{
                        display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end',
                    }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                                Paste CSV Statement
                            </label>
                            <textarea
                                value={csvContent}
                                onChange={e => setCsvContent(e.target.value)}
                                placeholder="Date,Amount,Description,Reference&#10;2024-01-15,-500.00,Check #1234,CHK1234"
                                rows={3}
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #475569',
                                    background: '#0f172a', color: '#e2e8f0', fontSize: 13, fontFamily: 'monospace',
                                    resize: 'vertical',
                                }}
                            />
                        </div>
                        <button
                            onClick={() => { setImportAcctId(activeSession.bank_account_id); handleImport(); }}
                            style={{
                                padding: '8px 20px', borderRadius: 8, border: 'none',
                                background: '#8b5cf6', color: '#fff', fontWeight: 600, cursor: 'pointer',
                                height: 40,
                            }}
                        >
                            Import CSV
                        </button>
                        {activeSession.status === 'IN_PROGRESS' && (
                            <button
                                onClick={handleComplete}
                                style={{
                                    padding: '8px 20px', borderRadius: 8, border: 'none',
                                    background: activeSession.difference === 0 ? '#22c55e' : '#475569',
                                    color: '#fff', fontWeight: 600, cursor: 'pointer', height: 40,
                                }}
                                disabled={activeSession.difference !== 0}
                            >
                                Complete Reconciliation
                            </button>
                        )}
                    </div>

                    {/* Transactions Table */}
                    <div style={{
                        background: '#1e293b', borderRadius: 12, padding: 20,
                        border: '1px solid #334155',
                    }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>
                            Transactions ({activeSession.transactions?.length || 0})
                        </h2>
                        {(!activeSession.transactions || activeSession.transactions.length === 0) ? (
                            <p style={{ color: '#64748b' }}>No transactions imported yet. Use the CSV import above.</p>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #334155' }}>
                                        <th style={thStyle}>Date</th>
                                        <th style={thStyle}>Amount</th>
                                        <th style={thStyle}>Description</th>
                                        <th style={thStyle}>Reference</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeSession.transactions.map((txn: BankTransaction) => (
                                        <tr key={txn.id} style={{
                                            borderBottom: '1px solid #1e293b',
                                            background: selectedBankTxn === txn.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                                        }}>
                                            <td style={tdStyle}>
                                                {new Date(txn.transaction_date).toLocaleDateString()}
                                            </td>
                                            <td style={{
                                                ...tdStyle,
                                                color: txn.amount >= 0 ? '#22c55e' : '#ef4444',
                                                fontWeight: 600,
                                            }}>
                                                {formatCents(txn.amount)}
                                            </td>
                                            <td style={tdStyle}>{txn.description}</td>
                                            <td style={{ ...tdStyle, color: '#94a3b8', fontSize: 13 }}>{txn.reference}</td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '2px 10px',
                                                    borderRadius: 12,
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    color: '#fff',
                                                    background: statusColor(txn.status),
                                                }}>
                                                    {txn.status}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                {txn.status === 'UNMATCHED' ? (
                                                    <button
                                                        onClick={() => setSelectedBankTxn(
                                                            selectedBankTxn === txn.id ? null : txn.id
                                                        )}
                                                        style={actionBtnStyle}
                                                    >
                                                        {selectedBankTxn === txn.id ? 'Cancel' : 'Select to Match'}
                                                    </button>
                                                ) : txn.status === 'MATCHED' ? (
                                                    <button
                                                        onClick={() => handleUnmatch(txn.id)}
                                                        style={{ ...actionBtnStyle, borderColor: '#ef4444', color: '#ef4444' }}
                                                    >
                                                        Unmatch
                                                    </button>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {selectedBankTxn && (
                            <div style={{
                                marginTop: 16, padding: 16, borderRadius: 8,
                                background: 'rgba(59,130,246,0.1)', border: '1px solid #3b82f633',
                            }}>
                                <p style={{ color: '#94a3b8', marginBottom: 8, fontSize: 13 }}>
                                    Enter the Journal Entry ID to match with this bank transaction:
                                </p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        type="text"
                                        ref={jeMatchInputRef}
                                        placeholder="Journal Entry UUID"
                                        style={{
                                            flex: 1, padding: '6px 10px', borderRadius: 6,
                                            border: '1px solid #475569', background: '#0f172a',
                                            color: '#e2e8f0', fontSize: 14,
                                        }}
                                    />
                                    <button
                                        onClick={() => {
                                            const value = jeMatchInputRef.current?.value;
                                            if (value && selectedBankTxn) {
                                                handleMatch(selectedBankTxn, value);
                                            }
                                        }}
                                        style={{
                                            padding: '6px 16px', borderRadius: 6, border: 'none',
                                            background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer',
                                        }}
                                    >
                                        Match
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Sessions List */}
            {tab === 'sessions' && !activeSession && (
                <div>
                    <div style={{
                        background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 20,
                        border: '1px solid #334155',
                    }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>
                            New Reconciliation Session
                        </h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>Bank Account</label>
                                <select
                                    value={newSessionAcctId}
                                    onChange={e => setNewSessionAcctId(e.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="">Select account...</option>
                                    {accounts.map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Period Start</label>
                                <input type="date" value={newSessionStart}
                                    onChange={e => setNewSessionStart(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Period End</label>
                                <input type="date" value={newSessionEnd}
                                    onChange={e => setNewSessionEnd(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Statement Ending Balance ($)</label>
                                <input type="number" step="0.01" value={newSessionBalance}
                                    onChange={e => setNewSessionBalance(e.target.value)} style={inputStyle} />
                            </div>
                        </div>
                        <button onClick={handleCreateSession} style={{
                            marginTop: 12, padding: '8px 20px', borderRadius: 8, border: 'none',
                            background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer',
                        }}>
                            Start Session
                        </button>
                    </div>

                    <div style={{
                        background: '#1e293b', borderRadius: 12, padding: 20,
                        border: '1px solid #334155',
                    }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>
                            Reconciliation Sessions ({sessions.length})
                        </h2>
                        {sessions.length === 0 ? (
                            <p style={{ color: '#64748b' }}>No sessions yet. Create one above.</p>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #334155' }}>
                                        <th style={thStyle}>Account</th>
                                        <th style={thStyle}>Period</th>
                                        <th style={thStyle}>Stmt Balance</th>
                                        <th style={thStyle}>Difference</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.map(s => (
                                        <tr key={s.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                            <td style={tdStyle}>{s.bank_account_name || 'N/A'}</td>
                                            <td style={tdStyle}>
                                                {new Date(s.period_start).toLocaleDateString()} - {new Date(s.period_end).toLocaleDateString()}
                                            </td>
                                            <td style={tdStyle}>{formatCents(s.statement_balance)}</td>
                                            <td style={{ ...tdStyle, color: s.difference === 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                                                {formatCents(s.difference)}
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                                                    color: '#fff',
                                                    background: s.status === 'COMPLETED' ? '#22c55e' : '#3b82f6',
                                                }}>
                                                    {s.status}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                <button onClick={() => handleOpenSession(s.id)} style={actionBtnStyle}>
                                                    Open
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Bank Accounts Tab */}
            {tab === 'accounts' && (
                <div>
                    <div style={{
                        background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 20,
                        border: '1px solid #334155',
                    }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>
                            Add Bank Account
                        </h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>Account Name</label>
                                <input value={newAcctName} onChange={e => setNewAcctName(e.target.value)}
                                    placeholder="Operating Account" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Account Number</label>
                                <input value={newAcctNumber} onChange={e => setNewAcctNumber(e.target.value)}
                                    placeholder="****1234" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Routing Number</label>
                                <input value={newAcctRouting} onChange={e => setNewAcctRouting(e.target.value)}
                                    placeholder="021000021" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>GL Account ID</label>
                                <input value={newAcctGLID} onChange={e => setNewAcctGLID(e.target.value)}
                                    placeholder="UUID of GL Cash account" style={inputStyle} />
                            </div>
                        </div>
                        <button onClick={handleCreateAccount} style={{
                            marginTop: 12, padding: '8px 20px', borderRadius: 8, border: 'none',
                            background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer',
                        }}>
                            Add Account
                        </button>
                    </div>

                    <div style={{
                        background: '#1e293b', borderRadius: 12, padding: 20,
                        border: '1px solid #334155',
                    }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>
                            Bank Accounts ({accounts.length})
                        </h2>
                        {accounts.length === 0 ? (
                            <p style={{ color: '#64748b' }}>No bank accounts configured.</p>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #334155' }}>
                                        <th style={thStyle}>Name</th>
                                        <th style={thStyle}>Account #</th>
                                        <th style={thStyle}>Routing #</th>
                                        <th style={thStyle}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accounts.map(a => (
                                        <tr key={a.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                            <td style={tdStyle}>{a.name}</td>
                                            <td style={tdStyle}>{a.account_number || '---'}</td>
                                            <td style={tdStyle}>{a.routing_number || '---'}</td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                                                    color: '#fff',
                                                    background: a.is_active ? '#22c55e' : '#6b7280',
                                                }}>
                                                    {a.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
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

const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#94a3b8',
    display: 'block',
    marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #475569',
    background: '#0f172a',
    color: '#e2e8f0',
    fontSize: 14,
};

const actionBtnStyle: React.CSSProperties = {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid #475569',
    background: 'transparent',
    color: '#3b82f6',
    cursor: 'pointer',
    fontSize: 12,
};

export default BankReconciliation;
